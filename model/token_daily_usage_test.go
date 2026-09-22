package model

import (
	"os"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestTokenDailyUsagePersistence(t *testing.T) {
	cases := []struct {
		name, env string
		open      func(string) gorm.Dialector
	}{
		{"sqlite", "", func(string) gorm.Dialector { return sqlite.Open(":memory:") }},
		{"mysql", "TEST_MYSQL_DSN", mysql.Open},
		{"postgres", "TEST_POSTGRES_DSN", postgres.Open},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dsn := os.Getenv(tc.env)
			if tc.env != "" && dsn == "" {
				t.Skip(tc.env + " not configured")
			}
			db, err := gorm.Open(tc.open(dsn), &gorm.Config{})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			sqlDB.SetMaxOpenConns(1)
			defer sqlDB.Close()
			oldDB, oldLog := DB, LOG_DB
			DB = db
			LOG_DB = db
			defer func() { DB = oldDB; LOG_DB = oldLog }()
			oldMainType, oldLogType := common.MainDatabaseType(), common.LogDatabaseType()
			defer common.SetDatabaseTypes(oldMainType, oldLogType)
			dbType := common.DatabaseTypeSQLite
			if tc.name == "mysql" {
				dbType = common.DatabaseTypeMySQL
			}
			if tc.name == "postgres" {
				dbType = common.DatabaseTypePostgreSQL
			}
			common.SetDatabaseTypes(dbType, dbType)
			// Only dedicated test databases are used. Exercise upgrade from existing logs.
			require.NoError(t, db.Migrator().DropTable(&TokenDailyUsage{}, &Log{}))
			require.NoError(t, db.AutoMigrate(&Log{}))
			now := time.Date(2026, 9, 22, 4, 0, 0, 0, time.UTC)
			today := tokenUsageMidnight(now)
			logs := []Log{
				{TokenId: 1, CreatedAt: today.AddDate(0, 0, -3).Unix() + 1, Type: LogTypeConsume, Quota: 10},
				{TokenId: 1, CreatedAt: today.AddDate(0, 0, -1).Unix(), Type: LogTypeConsume, Quota: 100},
				{TokenId: 1, CreatedAt: today.Unix() - 1, Type: LogTypeRefund, Quota: 20},
				{TokenId: 2, CreatedAt: today.Unix() - 1, Type: LogTypeConsume, Quota: 999},
				{TokenId: 1, CreatedAt: today.Unix(), Type: LogTypeConsume, Quota: 30},
			}
			require.NoError(t, db.Create(&logs).Error)
			for range 2 {
				require.NoError(t, db.AutoMigrate(&TokenDailyUsage{}))
			}
			for range 2 {
				require.NoError(t, InitTokenDailyUsage(now))
			}
			days, err := GetTokenDailyUsage(1, now)
			require.NoError(t, err)
			require.Len(t, days, 30)
			assert.Equal(t, "2026-08-24", days[0].Date)
			assert.Equal(t, "unavailable", days[0].Status)
			assert.Equal(t, "partial", days[26].Status)
			assert.Equal(t, "unavailable", days[27].Status)
			assert.Zero(t, days[27].Quota)
			assert.Equal(t, int64(80), days[28].Quota)
			assert.Equal(t, "partial", days[29].Status)
			assert.Equal(t, int64(30), days[29].Quota)
			require.NoError(t, createLog(&Log{TokenId: 1, CreatedAt: today.Unix() + 1, Type: LogTypeConsume, Quota: 7}))
			days, err = GetTokenDailyUsage(1, now)
			require.NoError(t, err)
			assert.Equal(t, int64(37), days[29].Quota)
			// Deleting retained historical logs must never erase already saved totals.
			require.NoError(t, db.Where("created_at < ?", today.Unix()).Delete(&Log{}).Error)
			require.NoError(t, InitTokenDailyUsage(now))
			days, err = GetTokenDailyUsage(1, now)
			require.NoError(t, err)
			assert.Equal(t, int64(80), days[28].Quota)
			require.NoError(t, InitTokenDailyUsage(now.AddDate(0, 0, 1)))
			days, err = GetTokenDailyUsage(1, now.AddDate(0, 0, 1))
			require.NoError(t, err)
			assert.Equal(t, int64(37), days[28].Quota)
			assert.Zero(t, days[29].Quota)
			// Purging current logs must not change the current committed total.
			require.NoError(t, db.Where("created_at >= ?", today.Unix()).Delete(&Log{}).Error)
			days, err = GetTokenDailyUsage(1, now)
			require.NoError(t, err)
			assert.Equal(t, int64(37), days[29].Quota)
			// Disabled logging leaves a durable incomplete marker even after re-enabling.
			common.LogConsumeEnabled = false
			RecordTaskBillingLog(RecordTaskBillingLogParams{LogType: LogTypeConsume, TokenId: 1, Quota: 5})
			common.LogConsumeEnabled = true
			var incomplete TokenDailyUsage
			require.NoError(t, db.Where("token_id = 1 AND day = ?", tokenUsageMidnight(time.Now()).Format("2006-01-02")).First(&incomplete).Error)
			assert.True(t, incomplete.Incomplete)
			// Late refunds update the archive without rereading deleted historical logs.
			require.NoError(t, createLog(&Log{TokenId: 1, CreatedAt: today.Unix() - 1, Type: LogTypeRefund, Quota: 10}))
			days, err = GetTokenDailyUsage(1, now)
			require.NoError(t, err)
			assert.Equal(t, int64(70), days[28].Quota)
			// Log INSERT and summary update roll back together on archive failure.
			require.NoError(t, db.Migrator().DropTable(&TokenDailyUsage{}))
			var before, after int64
			require.NoError(t, db.Model(&Log{}).Count(&before).Error)
			require.Error(t, createLog(&Log{TokenId: 1, CreatedAt: today.Unix(), Type: LogTypeConsume, Quota: 9}))
			require.NoError(t, db.Model(&Log{}).Count(&after).Error)
			assert.Equal(t, before, after)
			// Main database migration is idempotent on both upgraded and fresh storage.
			require.NoError(t, db.AutoMigrate(&TokenDailyUsage{}))
			require.NoError(t, db.Migrator().DropTable(&TokenDailyUsage{}))
			for range 2 {
				require.NoError(t, db.AutoMigrate(&TokenDailyUsage{}))
			}
			// Separate log storage owns both source records and transactional archives.
			logDB, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
			require.NoError(t, err)
			logSQL, err := logDB.DB()
			require.NoError(t, err)
			logSQL.SetMaxOpenConns(1)
			defer logSQL.Close()
			require.NoError(t, logDB.AutoMigrate(&Log{}))
			require.NoError(t, logDB.Create(&logs).Error)
			LOG_DB = logDB
			require.NoError(t, InitTokenDailyUsage(now))
			days, err = GetTokenDailyUsage(2, now)
			require.NoError(t, err)
			assert.Equal(t, int64(999), days[28].Quota)
			// Exercise the real default same-database startup, not only the helper.
			require.NoError(t, db.Migrator().DropTable(&TokenDailyUsage{}))
			oldMaster := common.IsMasterNode
			common.IsMasterNode = true
			t.Setenv("LOG_SQL_DSN", "")
			require.NoError(t, InitLogDB())
			require.NoError(t, InitLogDB())
			common.IsMasterNode = oldMaster
			var marker TokenDailyUsage
			require.NoError(t, db.Where("token_id = 0 AND day = ?", "coverage").First(&marker).Error)

		})
	}
}
