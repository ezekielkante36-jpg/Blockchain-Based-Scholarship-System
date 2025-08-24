import { describe, expect, it, vi, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface NFT {
  recipient: string;
  scholarshipId: number;
  metadata: string;
  status: string;
  mintedAt: number;
  lastUpdated: number;
}

interface TransferPermission {
  transferable: boolean;
  approvedBy: string;
  updatedAt: number;
}

interface MetadataHistory {
  metadata: string;
  updatedBy: string;
  timestamp: number;
  notes: string;
}

interface ContractState {
  nfts: Map<number, NFT>;
  transferPermissions: Map<number, TransferPermission>;
  metadataHistory: Map<string, MetadataHistory>; // Key: `${tokenId}-${version}`
  tokenCounter: number;
  paused: boolean;
  contractOwner: string;
  blockHeight: number;
  scholarshipRegistry: Map<number, { status: string; targetAmount: number }>;
  escrowVault: Map<number, { currentFunds: number; targetAmount: number }>;
}

// Mock contract implementation
class ScholarshipNFTMock {
  private state: ContractState = {
    nfts: new Map(),
    transferPermissions: new Map(),
    metadataHistory: new Map(),
    tokenCounter: 0,
    paused: false,
    contractOwner: "deployer",
    blockHeight: 1000,
    scholarshipRegistry: new Map(),
    escrowVault: new Map(),
  };

  private ERR_UNAUTHORIZED = 300;
  private ERR_NOT_FOUND = 301;
  private ERR_ALREADY_MINTED = 302;
  private ERR_INVALID_RECIPIENT = 303;
  private ERR_INVALID_METADATA = 304;
  private ERR_PAUSED = 305;
  private ERR_INVALID_SCHOLARSHIP = 306;
  private ERR_TRANSFER_DISABLED = 307;
  private ERR_INVALID_STATUS = 308;
  private ERR_MAX_METADATA_LEN_EXCEEDED = 309;
  private MAX_METADATA_LEN = 500;

  private incrementBlockHeight() {
    this.state.blockHeight += 1;
  }

  // Mock external contract calls
  private isScholarshipValid(scholarshipId: number): boolean {
    const scholarship = this.state.scholarshipRegistry.get(scholarshipId);
    return scholarship !== undefined && scholarship.status === "funded";
  }

  private isEscrowFunded(scholarshipId: number): boolean {
    const escrow = this.state.escrowVault.get(scholarshipId);
    return escrow !== undefined && escrow.currentFunds >= escrow.targetAmount;
  }

  mintNFT(
    caller: string,
    recipient: string,
    scholarshipId: number,
    metadata: string
  ): ClarityResponse<number> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (!this.isScholarshipValid(scholarshipId) || !this.isEscrowFunded(scholarshipId)) {
      return { ok: false, value: this.ERR_INVALID_SCHOLARSHIP };
    }
    if (recipient === "contract") {
      return { ok: false, value: this.ERR_INVALID_RECIPIENT };
    }
    if (metadata.length > this.MAX_METADATA_LEN) {
      return { ok: false, value: this.ERR_MAX_METADATA_LEN_EXCEEDED };
    }
    const tokenId = this.state.tokenCounter + 1;
    if (this.state.nfts.has(tokenId)) {
      return { ok: false, value: this.ERR_ALREADY_MINTED };
    }
    this.state.nfts.set(tokenId, {
      recipient,
      scholarshipId,
      metadata,
      status: "active",
      mintedAt: this.state.blockHeight,
      lastUpdated: this.state.blockHeight,
    });
    this.state.transferPermissions.set(tokenId, {
      transferable: false,
      approvedBy: this.state.contractOwner,
      updatedAt: this.state.blockHeight,
    });
    this.state.tokenCounter = tokenId;
    this.incrementBlockHeight();
    return { ok: true, value: tokenId };
  }

  updateNFTMetadata(
    caller: string,
    tokenId: number,
    newMetadata: string,
    notes: string
  ): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const nft = this.state.nfts.get(tokenId);
    if (!nft) {
      return { ok: false, value: this.ERR_NOT_FOUND };
    }
    if (caller !== nft.recipient && caller !== this.state.contractOwner) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (newMetadata.length > this.MAX_METADATA_LEN) {
      return { ok: false, value: this.ERR_MAX_METADATA_LEN_EXCEEDED };
    }
    this.state.nfts.set(tokenId, { ...nft, metadata: newMetadata, lastUpdated: this.state.blockHeight });
    this.state.metadataHistory.set(`${tokenId}-1`, {
      metadata: newMetadata,
      updatedBy: caller,
      timestamp: this.state.blockHeight,
      notes,
    });
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  updateNFTStatus(caller: string, tokenId: number, newStatus: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const nft = this.state.nfts.get(tokenId);
    if (!nft) {
      return { ok: false, value: this.ERR_NOT_FOUND };
    }
    if (caller !== this.state.contractOwner) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (!["active", "revoked", "redeemed"].includes(newStatus)) {
      return { ok: false, value: this.ERR_INVALID_STATUS };
    }
    this.state.nfts.set(tokenId, { ...nft, status: newStatus, lastUpdated: this.state.blockHeight });
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  setTransferPermission(caller: string, tokenId: number, transferable: boolean): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (!this.state.nfts.has(tokenId)) {
      return { ok: false, value: this.ERR_NOT_FOUND };
    }
    if (caller !== this.state.contractOwner) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.transferPermissions.set(tokenId, {
      transferable,
      approvedBy: caller,
      updatedAt: this.state.blockHeight,
    });
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  transferNFT(caller: string, tokenId: number, newRecipient: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const nft = this.state.nfts.get(tokenId);
    if (!nft) {
      return { ok: false, value: this.ERR_NOT_FOUND };
    }
    if (caller !== nft.recipient) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (newRecipient === "contract") {
      return { ok: false, value: this.ERR_INVALID_RECIPIENT };
    }
    const permissions = this.state.transferPermissions.get(tokenId);
    if (!permissions || !permissions.transferable) {
      return { ok: false, value: this.ERR_TRANSFER_DISABLED };
    }
    this.state.nfts.set(tokenId, { ...nft, recipient: newRecipient, lastUpdated: this.state.blockHeight });
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  pauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.contractOwner) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.paused = true;
    return { ok: true, value: true };
  }

  unpauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.contractOwner) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.paused = false;
    return { ok: true, value: true };
  }

  transferOwnership(caller: string, newOwner: string): ClarityResponse<boolean> {
    if (caller !== this.state.contractOwner) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.contractOwner = newOwner;
    return { ok: true, value: true };
  }

  getNFTDetails(tokenId: number): ClarityResponse<NFT | null> {
    return { ok: true, value: this.state.nfts.get(tokenId) ?? null };
  }

  getTransferPermissions(tokenId: number): ClarityResponse<TransferPermission | null> {
    return { ok: true, value: this.state.transferPermissions.get(tokenId) ?? null };
  }

  getMetadataHistory(tokenId: number, version: number): ClarityResponse<MetadataHistory | null> {
    return { ok: true, value: this.state.metadataHistory.get(`${tokenId}-${version}`) ?? null };
  }

  getTokenCount(): ClarityResponse<number> {
    return { ok: true, value: this.state.tokenCounter };
  }

  getContractOwner(): ClarityResponse<string> {
    return { ok: true, value: this.state.contractOwner };
  }

  isContractPaused(): ClarityResponse<boolean> {
    return { ok: true, value: this.state.paused };
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  recipient: "wallet_1",
  unauthorized: "wallet_2",
  newRecipient: "wallet_3",
  contract: "contract",
};

describe("ScholarshipNFT Contract", () => {
  let contract: ScholarshipNFTMock;

  beforeEach(() => {
    contract = new ScholarshipNFTMock();
    // Setup mock scholarship and escrow data
    contract.state.scholarshipRegistry.set(1, { status: "funded", targetAmount: 1000 });
    contract.state.escrowVault.set(1, { currentFunds: 1000, targetAmount: 1000 });
    vi.resetAllMocks();
  });

  it("should mint NFT for valid scholarship and recipient", () => {
    const result = contract.mintNFT(accounts.deployer, accounts.recipient, 1, "Scholarship for academic excellence");
    expect(result).toEqual({ ok: true, value: 1 });
    const nft = contract.getNFTDetails(1);
    expect(nft).toEqual({
      ok: true,
      value: expect.objectContaining({
        recipient: accounts.recipient,
        scholarshipId: 1,
        metadata: "Scholarship for academic excellence",
        status: "active",
      }),
    });
    expect(contract.getTokenCount()).toEqual({ ok: true, value: 1 });
  });

  it("should prevent minting when paused", () => {
    contract.pauseContract(accounts.deployer);
    const result = contract.mintNFT(accounts.deployer, accounts.recipient, 1, "Test scholarship");
    expect(result).toEqual({ ok: false, value: 305 });
  });

  it("should prevent minting for invalid scholarship", () => {
    contract.state.scholarshipRegistry.set(2, { status: "active", targetAmount: 1000 });
    const result = contract.mintNFT(accounts.deployer, accounts.recipient, 2, "Test scholarship");
    expect(result).toEqual({ ok: false, value: 306 });
  });

  it("should prevent minting for unfunded escrow", () => {
    contract.state.escrowVault.set(1, { currentFunds: 500, targetAmount: 1000 });
    const result = contract.mintNFT(accounts.deployer, accounts.recipient, 1, "Test scholarship");
    expect(result).toEqual({ ok: false, value: 306 });
  });

  it("should prevent minting to contract address", () => {
    const result = contract.mintNFT(accounts.deployer, accounts.contract, 1, "Test scholarship");
    expect(result).toEqual({ ok: false, value: 303 });
  });

  it("should prevent minting with oversized metadata", () => {
    const longMetadata = "a".repeat(501);
    const result = contract.mintNFT(accounts.deployer, accounts.recipient, 1, longMetadata);
    expect(result).toEqual({ ok: false, value: 309 });
  });

  it("should allow recipient or owner to update metadata", () => {
    contract.mintNFT(accounts.deployer, accounts.recipient, 1, "Initial metadata");
    const result = contract.updateNFTMetadata(
      accounts.recipient,
      1,
      "Updated metadata",
      "Updated for clarity"
    );
    expect(result).toEqual({ ok: true, value: true });
    const nft = contract.getNFTDetails(1);
    expect(nft).toEqual({
      ok: true,
      value: expect.objectContaining({ metadata: "Updated metadata" }),
    });
    const history = contract.getMetadataHistory(1, 1);
    expect(history).toEqual({
      ok: true,
      value: expect.objectContaining({ metadata: "Updated metadata", notes: "Updated for clarity" }),
    });
  });

  it("should prevent unauthorized metadata updates", () => {
    contract.mintNFT(accounts.deployer, accounts.recipient, 1, "Initial metadata");
    const result = contract.updateNFTMetadata(
      accounts.unauthorized,
      1,
      "Unauthorized update",
      "Invalid"
    );
    expect(result).toEqual({ ok: false, value: 300 });
  });

  it("should allow owner to update NFT status", () => {
    contract.mintNFT(accounts.deployer, accounts.recipient, 1, "Test scholarship");
    const result = contract.updateNFTStatus(accounts.deployer, 1, "redeemed");
    expect(result).toEqual({ ok: true, value: true });
    const nft = contract.getNFTDetails(1);
    expect(nft).toEqual({
      ok: true,
      value: expect.objectContaining({ status: "redeemed" }),
    });
  });

  it("should prevent invalid status updates", () => {
    contract.mintNFT(accounts.deployer, accounts.recipient, 1, "Test scholarship");
    const result = contract.updateNFTStatus(accounts.deployer, 1, "invalid");
    expect(result).toEqual({ ok: false, value: 308 });
  });

  it("should allow owner to set transfer permission", () => {
    contract.mintNFT(accounts.deployer, accounts.recipient, 1, "Test scholarship");
    const result = contract.setTransferPermission(accounts.deployer, 1, true);
    expect(result).toEqual({ ok: true, value: true });
    const permissions = contract.getTransferPermissions(1);
    expect(permissions).toEqual({
      ok: true,
      value: expect.objectContaining({ transferable: true }),
    });
  });

  it("should allow transfer when permitted", () => {
    contract.mintNFT(accounts.deployer, accounts.recipient, 1, "Test scholarship");
    contract.setTransferPermission(accounts.deployer, 1, true);
    const result = contract.transferNFT(accounts.recipient, 1, accounts.newRecipient);
    expect(result).toEqual({ ok: true, value: true });
    const nft = contract.getNFTDetails(1);
    expect(nft).toEqual({
      ok: true,
      value: expect.objectContaining({ recipient: accounts.newRecipient }),
    });
  });

  it("should prevent transfer when not permitted", () => {
    contract.mintNFT(accounts.deployer, accounts.recipient, 1, "Test scholarship");
    const result = contract.transferNFT(accounts.recipient, 1, accounts.newRecipient);
    expect(result).toEqual({ ok: false, value: 307 });
  });

  it("should pause and unpause contract", () => {
    const pauseResult = contract.pauseContract(accounts.deployer);
    expect(pauseResult).toEqual({ ok: true, value: true });
    expect(contract.isContractPaused()).toEqual({ ok: true, value: true });

    const mintDuringPause = contract.mintNFT(accounts.deployer, accounts.recipient, 1, "Test");
    expect(mintDuringPause).toEqual({ ok: false, value: 305 });

    const unpauseResult = contract.unpauseContract(accounts.deployer);
    expect(unpauseResult).toEqual({ ok: true, value: true });
    expect(contract.isContractPaused()).toEqual({ ok: true, value: false });
  });

  it("should allow ownership transfer", () => {
    const result = contract.transferOwnership(accounts.deployer, accounts.newRecipient);
    expect(result).toEqual({ ok: true, value: true });
    expect(contract.getContractOwner()).toEqual({ ok: true, value: accounts.newRecipient });
  });
});