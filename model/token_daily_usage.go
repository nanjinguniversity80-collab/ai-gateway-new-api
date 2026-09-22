package model

import (
	"errors"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Stored alongside logs so each billing record and its daily total commit
// atomically. These rows are not subject to raw-log retention.
// TokenID zero stores the coverage boundary; no API keys are persisted here.
type TokenDailyUsage struct {
	TokenID    int    `json:"-" gorm:"primaryKey;autoIncrement:false"`
	Day        string `json:"date" gorm:"primaryKey;size:10"`
	Quota      int64  `json:"quota"`
	Records    int64  `json:"-"`
	Incomplete bool   `json:"-"`
	UpdatedAt  int64  `json:"-"`
}

type TokenUsageDay struct {
	Date   string `json:"date"`
	Quota  int64  `json:"quota"`
	Status string `json:"status"`
}

var tokenUsageLocation = time.FixedZone("Asia/Shanghai", 8*60*60)

func tokenUsageMidnight(now time.Time) time.Time {
	local := now.In(tokenUsageLocation)
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, tokenUsageLocation)
}

func aggregateTokenUsage(db *gorm.DB, start, end int64, tokenID int) ([]TokenDailyUsage, error) {
	rows := []TokenDailyUsage{}
	query := db.Model(&Log{}).
		Select("token_id, COALESCE(SUM(CASE WHEN type = 6 THEN -quota ELSE quota END), 0) AS quota, COUNT(*) AS records").
		Where("created_at >= ? AND created_at < ? AND type IN ? AND token_id > 0", start, end, []int{LogTypeConsume, LogTypeRefund})
	if tokenID > 0 {
		query = query.Where("token_id = ?", tokenID)
	}
	err := query.Group("token_id").Scan(&rows).Error
	return rows, err
}

// Startup migration backfills retained history exactly once before serving
// traffic. Prior history is partial: logs may have been disabled or purged.
func InitTokenDailyUsage(now time.Time) error {
	if err := LOG_DB.AutoMigrate(&TokenDailyUsage{}); err != nil {
		return err
	}
	return LOG_DB.Transaction(func(tx *gorm.DB) error {
		marker := TokenDailyUsage{Day: "coverage", UpdatedAt: now.Unix()}
		inserted := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&marker)
		if inserted.Error != nil {
			return inserted.Error
		}
		// Unique marker insertion serializes initializers; marker and backfill commit together.
		var stored TokenDailyUsage
		if err := tx.Where("token_id = 0 AND day = ?", "coverage").First(&stored).Error; err != nil {
			return err
		}
		if inserted.RowsAffected == 0 {
			return nil
		}
		today := tokenUsageMidnight(now)
		for offset := 29; offset >= 0; offset-- {
			day := today.AddDate(0, 0, -offset)
			rows, err := aggregateTokenUsage(tx, day.Unix(), day.AddDate(0, 0, 1).Unix(), 0)
			if err != nil {
				return err
			}
			for i := range rows {
				rows[i].Day = day.Format("2006-01-02")
				rows[i].UpdatedAt = now.Unix()
				if err := tx.Create(&rows[i]).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
}

// Called inside the same SQL transaction as the source log INSERT. Atomic
// increments retain late records/refunds even after old raw logs are deleted.
func recordTokenDailyUsage(tx *gorm.DB, log *Log) error {
	if log.TokenId <= 0 || (log.Type != LogTypeConsume && log.Type != LogTypeRefund) {
		return nil
	}
	quota := int64(log.Quota)
	if log.Type == LogTypeRefund {
		quota = -quota
	}
	row := TokenDailyUsage{TokenID: log.TokenId, Day: tokenUsageMidnight(time.Unix(log.CreatedAt, 0)).Format("2006-01-02"), Quota: quota, Records: 1, UpdatedAt: time.Now().Unix()}
	return tx.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "token_id"}, {Name: "day"}},
		DoUpdates: clause.Assignments(map[string]any{
			"quota":      gorm.Expr("token_daily_usages.quota + ?", quota),
			"records":    gorm.Expr("token_daily_usages.records + 1"),
			"updated_at": row.UpdatedAt,
		}),
	}).Create(&row).Error
}

// Current-day totals advance with every committed billing record. Queries never
// need retained raw logs, including when today's logs have already been purged.
func GetTokenDailyUsage(tokenID int, now time.Time) ([]TokenUsageDay, error) {
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		return nil, errors.New("daily usage requires a transactional log database")
	}
	today := tokenUsageMidnight(now)
	start := today.AddDate(0, 0, -29)
	var coverage TokenDailyUsage
	if err := LOG_DB.Where("token_id = 0 AND day = ?", "coverage").First(&coverage).Error; err != nil {
		return nil, err
	}
	saved := []TokenDailyUsage{}
	if err := LOG_DB.Where("token_id = ? AND day >= ? AND day <= ?", tokenID, start.Format("2006-01-02"), today.Format("2006-01-02")).Find(&saved).Error; err != nil {
		return nil, err
	}
	totals := map[string]TokenDailyUsage{}
	for _, row := range saved {
		totals[row.Day] = row
	}
	days := make([]TokenUsageDay, 0, 30)
	for i := 0; i < 30; i++ {
		day := start.AddDate(0, 0, i)
		date := day.Format("2006-01-02")
		row := TokenUsageDay{Date: date, Status: "unavailable"}
		total, exists := totals[date]
		if day.Unix() >= coverage.UpdatedAt {
			row.Status = "archived"
		} else if exists {
			row.Status = "partial"
		}
		row.Quota = total.Quota
		if i == 29 {
			row.Status = "live"
			if day.Unix() < coverage.UpdatedAt {
				row.Status = "partial"
			}
		}
		if total.Incomplete {
			row.Status = "partial"
		}
		// A disabled consume log cannot prove usage is zero. Older saved totals
		// remain visible but cannot be claimed complete while accounting is paused.
		if !common.LogConsumeEnabled {
			if exists {
				row.Status = "partial"
			} else {
				row.Status = "unavailable"
			}
			if i == 29 {
				row.Status = "unavailable"
			}
		}
		days = append(days, row)
	}
	return days, nil
}

// Preserve evidence of disabled accounting across option changes and restarts.
func markTokenDailyUsageIncomplete(tokenID int) {
	if tokenID <= 0 || common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		return
	}
	row := TokenDailyUsage{TokenID: tokenID, Day: tokenUsageMidnight(time.Now()).Format("2006-01-02"), Incomplete: true}
	if err := LOG_DB.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "token_id"}, {Name: "day"}}, DoUpdates: clause.Assignments(map[string]any{"incomplete": true})}).Create(&row).Error; err != nil {
		common.SysError("mark incomplete daily usage: " + err.Error())
	}
}
