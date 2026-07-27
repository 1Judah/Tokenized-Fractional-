import React, { useState, useId } from 'react';
import Card from '../Card/Card';
import Input from '../Input/Input';
import Button from '../Button/Button';
import Spinner from '../Spinner/Spinner';
import Skeleton from '../Skeleton/Skeleton';
import SocialShare from '../SocialShare/SocialShare';
import ConfirmPurchase from '../ConfirmPurchase/ConfirmPurchase';
import { formatPrice, GAS_TIERS, calculatePurchaseFees, validateSharePurchaseInput } from '../../utils/feeCalculator';
import styles from './BuyShares.module.css';

const STROOP = 10_000_000;
export { formatPrice, GAS_TIERS };

/**
 * Enhanced BuyShares Component (#278)
 */
export default function BuyShares({
  shares = 0,
  loadingShares = false,
  loadingBuy = false,
  onBuy,
  acceptedTokens = [],
  paymentToken = '',
  onTokenChange,
  availableShares = null,
  totalShares = null,
  pricePerShare = null,
  buyAmount: controlledBuyAmount,
  onBuyAmountChange,
  asset = {},
  shareUrl = '',
  userWalletBalance = null, // in stroops or XLM
  recentTransactions = [],
}) {
  const [localBuyAmount, setLocalBuyAmount] = useState(1);
  const [gasTier, setGasTier] = useState('standard');
  const [activeTooltip, setActiveTooltip] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [purchaseStatus, setPurchaseStatus] = useState(null); // 'processing' | 'success' | 'error'
  const [txHash, setTxHash] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const buyAmountInputId = useId();
  const paymentTokenSelectId = useId();

  const isControlled = controlledBuyAmount !== undefined && onBuyAmountChange !== undefined;
  const buyAmount = isControlled ? controlledBuyAmount : localBuyAmount;

  const setBuyAmount = (val) => {
    const parsed = Math.max(1, Math.floor(Number(val) || 1));
    if (isControlled) {
      onBuyAmountChange(parsed);
    } else {
      setLocalBuyAmount(parsed);
    }
  };

  const soldShares = totalShares != null && availableShares != null ? totalShares - availableShares : null;
  const pct = totalShares != null && totalShares > 0 && availableShares != null
    ? Math.round(((totalShares - availableShares) / totalShares) * 100)
    : null;

  // Real-time calculations
  const baseCostStroops = pricePerShare != null ? pricePerShare * buyAmount : 0;
  const platformFeeStroops = Math.round(baseCostStroops * 0.005); // 0.5% platform fee
  const networkFeeStroops = GAS_TIERS[gasTier]?.feeStroops || 1000;
  const totalCostStroops = baseCostStroops + platformFeeStroops + networkFeeStroops;

  // Input Validation
  let validationError = null;
  if (!Number.isInteger(Number(buyAmount)) || Number(buyAmount) <= 0) {
    validationError = 'Please enter a valid positive whole number of shares.';
  } else if (availableShares != null && buyAmount > availableShares) {
    validationError = `Quantity exceeds available shares (${availableShares.toLocaleString()}).`;
  } else if (userWalletBalance != null && totalCostStroops > userWalletBalance) {
    validationError = `Total cost (${formatPrice(totalCostStroops)} XLM) exceeds wallet balance (${formatPrice(userWalletBalance)} XLM).`;
  }

  const handleOpenConfirm = () => {
    if (validationError) return;
    setIsConfirming(true);
  };

  const handleConfirmPurchase = async () => {
    setPurchaseStatus('processing');
    setErrorMessage(null);
    try {
      if (onBuy) {
        const result = await onBuy({
          amount: buyAmount,
          gasTier,
          totalCostStroops,
          platformFeeStroops,
          networkFeeStroops,
          paymentToken,
        });
        const hash = result?.txHash || `0x${Math.random().toString(16).substring(2, 42)}`;
        setTxHash(hash);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        setTxHash(`0x${Math.random().toString(16).substring(2, 42)}`);
      }
      setPurchaseStatus('success');
    } catch (err) {
      setPurchaseStatus('error');
      setErrorMessage(err.message || 'Transaction failed or rejected by network.');
    }
  };

  const shortAddress = (addr) =>
    addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';

  return (
    <Card className={styles.buyCard}>
      {/* ── Availability section ─────────────────────────────────────── */}
      {(availableShares != null || totalShares != null) && (
        <div className={styles.availabilitySection}>
          <div className={styles.availabilityHeader}>
            <span className={styles.availabilityLabel}>Share Availability</span>
            {availableShares != null && totalShares != null ? (
              <span className={styles.availabilityCount}>
                <strong>{availableShares.toLocaleString()}</strong>
                <span className={styles.availabilityTotal}> / {totalShares.toLocaleString()} available</span>
              </span>
            ) : (
              <Skeleton variant="text" width="6rem" height="1em" />
            )}
          </div>
          {pct != null ? (
            <div className={styles.progressTrack} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% of shares sold`}>
              <div className={styles.progressFill} style={{ width: `${pct}%` }} />
            </div>
          ) : (
            <Skeleton variant="text" height="0.6rem" style={{ borderRadius: '99px' }} />
          )}
          {soldShares != null && totalShares != null && (
            <span className={styles.progressCaption}>{pct}% sold ({soldShares.toLocaleString()} of {totalShares.toLocaleString()})</span>
          )}
        </div>
      )}

      {/* ── Real-Time Price & Fee Calculations (#278) ──────────────── */}
      {pricePerShare != null && (
        <div className={styles.priceSection}>
          <div className={styles.priceRow}>
            <span className={styles.priceLabel}>Price per share</span>
            <span className={styles.priceValue}>{formatPrice(pricePerShare)} XLM</span>
          </div>

          <div className={styles.priceRow}>
            <span className={styles.priceLabel}>
              Base Shares Cost ({buyAmount} share{buyAmount !== 1 ? 's' : ''})
            </span>
            <span className={styles.priceValue}>{formatPrice(baseCostStroops)} XLM</span>
          </div>

          <div className={styles.priceRow}>
            <span className={styles.priceLabel}>
              Platform Fee (0.5%)
              <button
                type="button"
                className={styles.infoTooltipBtn}
                onClick={() => setActiveTooltip(activeTooltip === 'platform' ? null : 'platform')}
                title="Platform fee info"
              >
                ⓘ
              </button>
            </span>
            <span className={styles.priceValue}>{formatPrice(platformFeeStroops)} XLM</span>
          </div>
          {activeTooltip === 'platform' && (
            <div className={styles.tooltipBox}>
              Platform Fee: A low 0.5% fee supporting marketplace smart contracts and operations.
            </div>
          )}

          <div className={styles.priceRow}>
            <span className={styles.priceLabel}>
              Network / Gas Fee
              <button
                type="button"
                className={styles.infoTooltipBtn}
                onClick={() => setActiveTooltip(activeTooltip === 'gas' ? null : 'gas')}
                title="Gas fee info"
              >
                ⓘ
              </button>
            </span>
            <span className={styles.priceValue}>{formatPrice(networkFeeStroops)} XLM</span>
          </div>
          {activeTooltip === 'gas' && (
            <div className={styles.tooltipBox}>
              Network Fee: Paid to Stellar network validators to include your transaction.
            </div>
          )}

          <hr className={styles.dividerSub} />

          <div className={styles.priceRow}>
            <span className={styles.priceLabelBold}>Total Estimated Cost</span>
            <span className={styles.totalCostValue}>{formatPrice(totalCostStroops)} XLM</span>
          </div>

          <div className={styles.timelineHint}>
            ⏱ Estimated Timeline: <strong>{GAS_TIERS[gasTier]?.estimatedTime}</strong> confirmation
          </div>
        </div>
      )}

      {/* ── Gas Tier Selector (#278) ─────────────────────────────────── */}
      <div className={styles.gasSelectorRow}>
        <label htmlFor="gas-tier-select" className={styles.gasLabel}>Gas Estimation Speed:</label>
        <select
          id="gas-tier-select"
          className={styles.gasSelect}
          value={gasTier}
          onChange={(e) => setGasTier(e.target.value)}
          disabled={loadingBuy}
        >
          {Object.entries(GAS_TIERS).map(([key, info]) => (
            <option key={key} value={key}>
              {info.name} ({formatPrice(info.feeStroops)} XLM)
            </option>
          ))}
        </select>
      </div>

      <hr className={styles.divider} />

      {/* ── Holdings row ──────────────────────────────────────────────── */}
      <div className={styles.holdingsRow}>
        <span className={styles.holdingsLabel}>Your Share Balance</span>
        {loadingShares ? (
          <span className={styles.holdingsValueLoading}>
            <Spinner size="sm" label="Fetching share balance…" />
            <Skeleton variant="text" width="3rem" height="1.6em" />
          </span>
        ) : (
          <span className={styles.holdingsValue}>{shares}</span>
        )}
      </div>
      <hr className={styles.divider} />

      <h3 className={styles.purchaseHeader}>Buy Fractional Shares</h3>

      {acceptedTokens.length > 1 && (
        <div className={styles.tokenRow}>
          <label htmlFor={paymentTokenSelectId} className={styles.tokenLabel}>
            Pay with
          </label>
          <select
            id={paymentTokenSelectId}
            className={styles.tokenSelect}
            value={paymentToken}
            onChange={(e) => onTokenChange && onTokenChange(e.target.value)}
            disabled={loadingBuy}
          >
            {acceptedTokens.map((t) => (
              <option key={t} value={t} title={t}>
                {shortAddress(t)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className={styles.purchaseRow}>
        <Input
          id={buyAmountInputId}
          type="number"
          value={buyAmount}
          onChange={(e) => setBuyAmount(e.target.value)}
          min="1"
          max={availableShares ?? undefined}
          disabled={loadingBuy}
          className={styles.buyInput}
        />
        <Button
          onClick={handleOpenConfirm}
          loading={loadingBuy}
          disabled={!!validationError || loadingBuy}
          variant="primary"
        >
          {loadingBuy ? 'Processing…' : 'Review Purchase'}
        </Button>
      </div>

      {validationError && (
        <div className={styles.validationErrorMsg} role="alert">
          ⚠️ {validationError}
        </div>
      )}

      {/* ── Recent Asset Transactions Context (#278) ────────────────── */}
      {recentTransactions.length > 0 && (
        <div className={styles.recentTxSection}>
          <h4 className={styles.recentTxTitle}>Recent Activity for Asset</h4>
          <ul className={styles.recentTxList}>
            {recentTransactions.slice(0, 3).map((tx, idx) => (
              <li key={tx.id || idx} className={styles.recentTxItem}>
                <span>Bought {tx.shareCount} share{tx.shareCount > 1 ? 's' : ''}</span>
                <span className={styles.recentTxDate}>{new Date(tx.timestamp || Date.now()).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Confirmation Modal Component (#278) ───────────────────────── */}
      {isConfirming && (
        <ConfirmPurchase
          asset={asset}
          shares={buyAmount}
          pricePerShare={pricePerShare}
          baseCostStroops={baseCostStroops}
          platformFeeStroops={platformFeeStroops}
          networkFeeStroops={networkFeeStroops}
          totalCostStroops={totalCostStroops}
          gasTier={gasTier}
          status={purchaseStatus}
          txHash={txHash}
          errorMessage={errorMessage}
          onConfirm={handleConfirmPurchase}
          onCancel={() => {
            setIsConfirming(false);
            setPurchaseStatus(null);
            setErrorMessage(null);
          }}
        />
      )}

      {/* ── Social Share Section ──────────────────────────────────────── */}
      {asset && Object.keys(asset).length > 0 && (
        <>
          <hr className={styles.divider} />
          <div className={styles.socialShareSection}>
            <SocialShare
              asset={asset}
              url={shareUrl || (typeof window !== 'undefined' ? window.location.href : '')}
              compact={false}
              showLabel={true}
            />
          </div>
        </>
      )}
    </Card>
  );
}
