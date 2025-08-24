;; ScholarshipNFT Smart Contract
;; Issues and manages NFTs as proof of scholarship awards, ensuring verifiable credentials.
;; Integrates with ScholarshipRegistry for validation and EscrowVault for fund release.

;; Constants
(define-constant ERR-UNAUTHORIZED (err u300))
(define-constant ERR-NOT-FOUND (err u301))
(define-constant ERR-ALREADY-MINTED (err u302))
(define-constant ERR-INVALID-RECIPIENT (err u303))
(define-constant ERR-INVALID-METADATA (err u304))
(define-constant ERR-PAUSED (err u305))
(define-constant ERR-INVALID-SCHOLARSHIP (err u306))
(define-constant ERR-TRANSFER-DISABLED (err u307))
(define-constant ERR-INVALID-STATUS (err u308))
(define-constant ERR-MAX-METADATA-LEN-EXCEEDED (err u309))

(define-constant MAX-METADATA-LEN u500)
(define-constant SCHOLARSHIP-REGISTRY-CONTRACT "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.scholarship-registry")
(define-constant ESCROW-VAULT-CONTRACT "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.escrow-vault")

;; Data Variables
(define-data-var contract-owner principal tx-sender)
(define-data-var paused bool false)
(define-data-var token-counter uint u0)

;; Data Maps
(define-map nfts
  { token-id: uint }
  {
    recipient: principal,
    scholarship-id: uint,
    metadata: (string-utf8 MAX-METADATA-LEN),
    status: (string-ascii 20), ;; e.g., "active", "revoked", "redeemed"
    minted-at: uint,
    last-updated: uint
  }
)

(define-map transfer-permissions
  { token-id: uint }
  { transferable: bool, approved-by: principal, updated-at: uint }
)

(define-map metadata-history
  { token-id: uint, version: uint }
  {
    metadata: (string-utf8 MAX-METADATA-LEN),
    updated-by: principal,
    timestamp: uint,
    notes: (string-utf8 200)
  }
)

;; Private Functions
(define-private (is-scholarship-valid (scholarship-id uint))
  (let ((scholarship (contract-call? .scholarship-registry get-scholarship-details scholarship-id)))
    (and (is-some scholarship)
         (is-eq (get status (unwrap-panic scholarship)) "funded"))))

(define-private (is-escrow-funded (scholarship-id uint))
  (let ((escrow (contract-call? .escrow-vault get-escrow-details scholarship-id)))
    (and (is-some escrow)
         (>= (get current-funds (unwrap-panic escrow))
             (get target-amount (unwrap-panic escrow))))))

(define-private (validate-metadata (metadata (string-utf8 MAX-METADATA-LEN)))
  (<= (len metadata) MAX-METADATA-LEN))

(define-private (is-owner-or-authorized (token-id uint) (caller principal))
  (let ((nft (map-get? nfts {token-id: token-id})))
    (if (is-none nft)
      false
      (or (is-eq (get recipient (unwrap-panic nft)) caller)
          (is-eq caller (var-get contract-owner))))))

;; Public Functions
(define-public (mint-nft 
  (recipient principal) 
  (scholarship-id uint) 
  (metadata (string-utf8 MAX-METADATA-LEN)))
  (begin
    (asserts! (not (var-get paused)) ERR-PAUSED)
    (asserts! (is-scholarship-valid scholarship-id) ERR-INVALID-SCHOLARSHIP)
    (asserts! (is-escrow-funded scholarship-id) ERR-INVALID-SCHOLARSHIP)
    (asserts! (not (is-eq recipient (as-contract tx-sender))) ERR-INVALID-RECIPIENT)
    (asserts! (validate-metadata metadata) ERR-MAX-METADATA-LEN-EXCEEDED)
    (let ((token-id (+ (var-get token-counter) u1))
          (existing-nft (map-get? nfts {token-id: token-id})))
      (asserts! (is-none existing-nft) ERR-ALREADY-MINTED)
      (map-set nfts
        {token-id: token-id}
        {
          recipient: recipient,
          scholarship-id: scholarship-id,
          metadata: metadata,
          status: "active",
          minted-at: block-height,
          last-updated: block-height
        })
      (map-set transfer-permissions
        {token-id: token-id}
        {transferable: false, approved-by: (var-get contract-owner), updated-at: block-height})
      (var-set token-counter token-id)
      (print {event: "nft-minted", token-id: token-id, recipient: recipient, scholarship-id: scholarship-id})
      (ok token-id))))

(define-public (update-nft-metadata 
  (token-id uint) 
  (new-metadata (string-utf8 MAX-METADATA-LEN)) 
  (notes (string-utf8 200)))
  (let ((nft (map-get? nfts {token-id: token-id})))
    (asserts! (not (var-get paused)) ERR-PAUSED)
    (asserts! (is-some nft) ERR-NOT-FOUND)
    (asserts! (is-owner-or-authorized token-id tx-sender) ERR-UNAUTHORIZED)
    (asserts! (validate-metadata new-metadata) ERR-MAX-METADATA-LEN-EXCEEDED)
    (let ((data (unwrap-panic nft))
          (version (default-to u1 (map-get? metadata-history {token-id: token-id, version: u0}))))
      (map-set nfts
        {token-id: token-id}
        (merge data {metadata: new-metadata, last-updated: block-height}))
      (map-set metadata-history
        {token-id: token-id, version: version}
        {
          metadata: new-metadata,
          updated-by: tx-sender,
          timestamp: block-height,
          notes: notes
        })
      (print {event: "metadata-updated", token-id: token-id, version: version})
      (ok true))))

(define-public (update-nft-status 
  (token-id uint) 
  (new-status (string-ascii 20)))
  (let ((nft (map-get? nfts {token-id: token-id})))
    (asserts! (not (var-get paused)) ERR-PAUSED)
    (asserts! (is-some nft) ERR-NOT-FOUND)
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-UNAUTHORIZED)
    (asserts! (or (is-eq new-status "active") 
                  (is-eq new-status "revoked") 
                  (is-eq new-status "redeemed")) ERR-INVALID-STATUS)
    (map-set nfts
      {token-id: token-id}
      (merge (unwrap-panic nft) {status: new-status, last-updated: block-height}))
    (print {event: "status-updated", token-id: token-id, new-status: new-status})
    (ok true)))

(define-public (set-transfer-permission 
  (token-id uint) 
  (transferable bool))
  (let ((nft (map-get? nfts {token-id: token-id})))
    (asserts! (not (var-get paused)) ERR-PAUSED)
    (asserts! (is-some nft) ERR-NOT-FOUND)
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-UNAUTHORIZED)
    (map-set transfer-permissions
      {token-id: token-id}
      {
        transferable: transferable,
        approved-by: tx-sender,
        updated-at: block-height
      })
    (print {event: "transfer-permission-updated", token-id: token-id, transferable: transferable})
    (ok true)))

(define-public (transfer-nft 
  (token-id uint) 
  (new-recipient principal))
  (let ((nft (map-get? nfts {token-id: token-id}))
        (permissions (map-get? transfer-permissions {token-id: token-id})))
    (asserts! (not (var-get paused)) ERR-PAUSED)
    (asserts! (is-some nft) ERR-NOT-FOUND)
    (asserts! (is-eq (get recipient (unwrap-panic nft)) tx-sender) ERR-UNAUTHORIZED)
    (asserts! (not (is-eq new-recipient (as-contract tx-sender))) ERR-INVALID-RECIPIENT)
    (asserts! (and (is-some permissions) (get transferable (unwrap-panic permissions))) ERR-TRANSFER-DISABLED)
    (map-set nfts
      {token-id: token-id}
      (merge (unwrap-panic nft) {recipient: new-recipient, last-updated: block-height}))
    (print {event: "nft-transferred", token-id: token-id, new-recipient: new-recipient})
    (ok true)))

(define-public (pause-contract)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-UNAUTHORIZED)
    (var-set paused true)
    (ok true)))

(define-public (unpause-contract)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-UNAUTHORIZED)
    (var-set paused false)
    (ok true)))

(define-public (transfer-ownership (new-owner principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-UNAUTHORIZED)
    (var-set contract-owner new-owner)
    (ok true)))

;; Read-Only Functions
(define-read-only (get-nft-details (token-id uint))
  (map-get? nfts {token-id: token-id}))

(define-read-only (get-transfer-permissions (token-id uint))
  (map-get? transfer-permissions {token-id: token-id}))

(define-read-only (get-metadata-history (token-id uint) (version uint))
  (map-get? metadata-history {token-id: token-id, version: version}))

(define-read-only (get-token-count)
  (ok (var-get token-counter)))

(define-read-only (get-contract-owner)
  (ok (var-get contract-owner)))

(define-read-only (is-contract-paused)
  (ok (var-get paused)))