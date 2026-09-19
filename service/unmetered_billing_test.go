package service

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func enableUnmeteredQuotaForTest(t *testing.T) {
	t.Helper()
	previous := common.UnmeteredQuotaEnabled
	common.UnmeteredQuotaEnabled = true
	t.Cleanup(func() {
		common.UnmeteredQuotaEnabled = previous
	})
}

func TestUnmeteredBillingBypassesWalletAndKeepsUsageAccounting(t *testing.T) {
	truncate(t)
	enableUnmeteredQuotaForTest(t)

	const userID = 801
	seedUser(t, userID, 0)
	relayInfo := &relaycommon.RelayInfo{
		UserId:         userID,
		TokenUnlimited: true,
	}
	ctx, _ := gin.CreateTestContext(nil)

	session, apiErr := NewBillingSession(ctx, relayInfo, 100)
	require.Nil(t, apiErr)
	require.IsType(t, &UnmeteredFunding{}, session.funding)
	assert.Equal(t, BillingSourceUnmetered, relayInfo.BillingSource)
	assert.Equal(t, 100, relayInfo.FinalPreConsumedQuota)
	require.NoError(t, session.Settle(150))

	quota, err := model.GetUserQuota(userID, true)
	require.NoError(t, err)
	assert.Zero(t, quota)

	model.UpdateUserUsedQuotaAndRequestCount(userID, 150)
	var user model.User
	require.NoError(t, model.DB.First(&user, userID).Error)
	assert.Equal(t, 150, user.UsedQuota)
	assert.Equal(t, 1, user.RequestCount)
}

func TestUnmeteredBillingStillEnforcesBoundedTokenQuota(t *testing.T) {
	truncate(t)
	enableUnmeteredQuotaForTest(t)

	const (
		userID  = 802
		tokenID = 803
	)
	seedUser(t, userID, 0)
	seedToken(t, tokenID, userID, "bounded-token", 50)
	relayInfo := &relaycommon.RelayInfo{
		UserId:   userID,
		TokenId:  tokenID,
		TokenKey: "bounded-token",
	}
	ctx, _ := gin.CreateTestContext(nil)

	session, apiErr := NewBillingSession(ctx, relayInfo, 100)
	assert.Nil(t, session)
	require.NotNil(t, apiErr)
	assert.Contains(t, apiErr.Error(), "token quota is not enough")
}
