package service

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

type auditTokenRegistration struct {
	Name string `json:"name"`
	Key  string `json:"key"`
}

// SyncAuditTokenName registers the token's display name with the private audit
// service. It intentionally returns without work when the personal gateway
// integration is not configured, so upstream New API deployments are unchanged.
func SyncAuditTokenName(name string, rawKey string) error {
	endpoint := strings.TrimSpace(os.Getenv("AUDIT_TOKEN_SYNC_URL"))
	if endpoint == "" {
		return nil
	}
	secret := os.Getenv("AUDIT_TOKEN_SYNC_SECRET")
	if secret == "" {
		return fmt.Errorf("audit token sync secret is not configured")
	}
	if !strings.HasPrefix(rawKey, "sk-") {
		rawKey = "sk-" + rawKey
	}
	payload, err := common.Marshal(auditTokenRegistration{Name: name, Key: rawKey})
	if err != nil {
		return fmt.Errorf("marshal audit token registration: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("create audit token registration request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Audit-Token-Sync", secret)
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("send audit token registration: %w", err)
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("audit token registration returned HTTP %d", response.StatusCode)
	}
	return nil
}

// SyncAllAuditTokenNames repairs registrations missed while the audit service
// was unavailable and backfills tokens created before synchronization existed.
func SyncAllAuditTokenNames() error {
	if strings.TrimSpace(os.Getenv("AUDIT_TOKEN_SYNC_URL")) == "" {
		return nil
	}
	var tokens []model.Token
	if err := model.DB.Find(&tokens).Error; err != nil {
		return fmt.Errorf("list tokens for audit synchronization: %w", err)
	}
	for i := range tokens {
		if err := SyncAuditTokenName(tokens[i].Name, tokens[i].GetFullKey()); err != nil {
			return fmt.Errorf("synchronize audit name for token %d: %w", tokens[i].Id, err)
		}
	}
	return nil
}

func StartAuditTokenSyncTask() {
	if strings.TrimSpace(os.Getenv("AUDIT_TOKEN_SYNC_URL")) == "" {
		return
	}
	go func() {
		interval := 10 * time.Second
		for {
			if err := SyncAllAuditTokenNames(); err != nil {
				common.SysError("audit token name reconciliation failed: " + err.Error())
			} else {
				interval = 5 * time.Minute
			}
			time.Sleep(interval)
		}
	}()
}
