# 🎓 Blockchain-Based Scholarship System

Welcome to a transparent and secure scholarship issuance platform built on the Stacks blockchain! This project ensures fair, verifiable, and fraud-resistant scholarship allocation for students, institutions, and sponsors.

## ✨ Features

🔒 **Transparent Allocation**: Scholarship criteria and awards are recorded immutably on-chain.  
💸 **Secure Fund Distribution**: Funds are locked in escrow and released only upon meeting conditions.  
📜 **Verifiable Credentials**: Student eligibility and achievements are verified on-chain.  
🔍 **Auditability**: All transactions and decisions are publicly verifiable.  
🚀 **Decentralized Governance**: Sponsors and institutions vote on scholarship rules.  
🎯 **Fraud Prevention**: Prevents duplicate applications and ensures unique scholarship IDs.  
📊 **Progress Tracking**: Monitors student milestones for performance-based scholarships.  
💰 **Redemption System**: Students can redeem scholarships for approved expenses.

## 🛠 How It Works

**For Sponsors**  
- Create scholarships with specific criteria (e.g., GPA, field of study).  
- Fund scholarships via the escrow contract.  
- Vote on scholarship rule changes through the governance contract.

**For Students**  
- Submit applications with proof of eligibility (e.g., academic records).  
- Receive unique scholarship NFTs upon approval.  
- Redeem funds for approved expenses (e.g., tuition, books).  

**For Institutions**  
- Verify student credentials and eligibility.  
- Approve scholarship disbursements based on milestones.  
- Audit scholarship usage via the blockchain.

**For Verifiers**  
- Check scholarship details, recipient status, and fund usage on-chain.  
- Verify authenticity of awarded scholarships using NFT metadata.

## 📑 Smart Contracts

1. **ScholarshipRegistry**: Registers new scholarships with unique IDs, criteria, and funding details.  
2. **StudentRegistry**: Stores student profiles and verified credentials.  
3. **ApplicationManager**: Handles scholarship applications and prevents duplicates.  
4. **EscrowVault**: Manages scholarship funds, locking and releasing based on conditions.  
5. **ScholarshipNFT**: Issues unique NFTs to scholarship recipients, storing metadata.  
6. **VerificationOracle**: Integrates off-chain credential verification (e.g., academic records).  
7. **GovernanceDAO**: Enables sponsors and institutions to vote on scholarship rules.  
8. **MilestoneTracker**: Tracks student progress for performance-based scholarships.

## 🚀 Getting Started

### Prerequisites
- Stacks blockchain wallet (e.g., Hiro Wallet).  
- Clarity development environment (e.g., Clarinet).  
- STX tokens for transaction fees.

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/your-repo/scholarship-system.git
   ```
2. Install Clarinet:
   ```bash
   npm install -g @stacks/clarinet
   ```
3. Deploy contracts using Clarinet:
   ```bash
   clarinet deploy
   ```

### Usage
1. **Sponsors**: Call `ScholarshipRegistry::create-scholarship` with criteria and funding amount.  
2. **Students**: Submit applications via `ApplicationManager::submit-application`.  
3. **Institutions**: Verify credentials using `VerificationOracle::verify-credentials`.  
4. **Students**: Redeem scholarships via `EscrowVault::redeem-funds`.  
5. **Verifiers**: Query `ScholarshipNFT::get-details` for transparency.

## 🛠 Example Contract: ScholarshipRegistry

```clarity
(define-data-var scholarship-counter uint u0)

(define-map scholarships
  { scholarship-id: uint }
  { creator: principal, criteria: (string-utf8 256), amount: uint, status: (string-ascii 20) })

(define-public (create-scholarship (criteria (string-utf8 256)) (amount uint))
  (let ((scholarship-id (var-get scholarship-counter)))
    (map-insert scholarships
      { scholarship-id: scholarship-id }
      { creator: tx-sender, criteria: criteria, amount: amount, status: "active" })
    (var-set scholarship-counter (+ scholarship-id u1))
    (ok scholarship-id)))
```

## 📜 License
MIT License
