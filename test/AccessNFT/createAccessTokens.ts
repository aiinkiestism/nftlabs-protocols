import { ethers } from "hardhat";
import { expect } from "chai";

// Contract Types
import { AccessNFT } from "../../typechain/AccessNFT";
import { Forwarder } from "../../typechain/Forwarder";

// Types
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BytesLike } from "@ethersproject/bytes";

// Test utils
import { getContracts, Contracts } from "../../utils/tests/getContracts";
import { getURIs, getAmounts } from "../../utils/tests/params";
import { sendGaslessTx } from "../../utils/tests/gasless";

describe("Calling 'createAccessTokens'", function () {
  // Signers
  let protocolProvider: SignerWithAddress;
  let protocolAdmin: SignerWithAddress;
  let creator: SignerWithAddress;
  let relayer: SignerWithAddress;

  // Contracts
  let accessNft: AccessNFT;
  let forwarder: Forwarder;

  // Reward parameters
  const rewardURIs: string[] = getURIs();
  const accessURIs = getURIs(rewardURIs.length);
  const rewardSupplies: number[] = getAmounts(rewardURIs.length);
  const emptyData: BytesLike = ethers.utils.toUtf8Bytes("");

  before(async () => {
    // Get signers
    const signers: SignerWithAddress[] = await ethers.getSigners();
    [protocolProvider, protocolAdmin, creator, relayer] = signers;
  });

  beforeEach(async () => {
    // Get contracts
    const contracts: Contracts = await getContracts(protocolProvider, protocolAdmin);
    accessNft = contracts.accessNft;
    forwarder = contracts.forwarder;
  });

  describe("Revert", function () {
    it("Should revert if unequal number of URIs and supplies are provided", async () => {
      // Grant Minter role to creator
      const MINTER_ROLE = await accessNft.MINTER_ROLE();
      await accessNft.connect(protocolAdmin).grantRole(MINTER_ROLE, creator.address);

      await expect(
        sendGaslessTx(creator, forwarder, relayer, {
          from: creator.address,
          to: accessNft.address,
          data: accessNft.interface.encodeFunctionData("createAccessTokens", [
            creator.address,
            rewardURIs.slice(1),
            accessURIs,
            rewardSupplies,
            emptyData,
          ]),
        }),
      ).to.be.revertedWith("AccessNFT: Must specify equal number of config values.");

      await expect(
        sendGaslessTx(creator, forwarder, relayer, {
          from: creator.address,
          to: accessNft.address,
          data: accessNft.interface.encodeFunctionData("createAccessTokens", [
            creator.address,
            rewardURIs,
            accessURIs.slice(1),
            rewardSupplies,
            emptyData,
          ]),
        }),
      ).to.be.revertedWith("AccessNFT: Must specify equal number of config values.");

      await expect(
        sendGaslessTx(creator, forwarder, relayer, {
          from: creator.address,
          to: accessNft.address,
          data: accessNft.interface.encodeFunctionData("createAccessTokens", [
            creator.address,
            rewardURIs,
            accessURIs,
            rewardSupplies.slice(1),
            emptyData,
          ]),
        }),
      ).to.be.revertedWith("AccessNFT: Must specify equal number of config values.");
    });

    it("Should revert if no NFTs are to be created", async () => {
      // Grant Minter role to creator
      const MINTER_ROLE = await accessNft.MINTER_ROLE();
      await accessNft.connect(protocolAdmin).grantRole(MINTER_ROLE, creator.address);

      await expect(
        accessNft.connect(creator).createAccessTokens(creator.address, [], [], [], emptyData),
      ).to.be.revertedWith("AccessNFT: Must create at least one NFT.");
    });

    it("Should revert if caller does not have MINTER_ROLE", async () => {
      await expect(
        sendGaslessTx(creator, forwarder, relayer, {
          from: creator.address,
          to: accessNft.address,
          data: accessNft.interface.encodeFunctionData("createAccessTokens", [creator.address, [], [], [], emptyData]),
        }),
      ).to.be.reverted;
    });
  });

  describe("Events", function () {
    beforeEach(async () => {
      // Grant Minter role to creator
      const MINTER_ROLE = await accessNft.MINTER_ROLE();
      await accessNft.connect(protocolAdmin).grantRole(MINTER_ROLE, creator.address);
    });

    it("Should emit AccessNFTsCreated", async () => {
      const eventPromise = new Promise(async (resolve, reject) => {
        const nextAccessNftId: number = parseInt((await accessNft.nextTokenId()).toString());

        accessNft.on(
          "AccessNFTsCreated",
          (
            _creator: string,
            _nftIds: number[],
            _nftURIs: string[],
            _accessNftIds: number[],
            _accessURIs: string[],
            _nftSupplies: number[],
          ) => {
            expect(_creator).to.equal(creator.address);

            for (let i = 0; i < rewardURIs.length; i++) {
              expect(rewardURIs[i]).to.equal(_nftURIs[i]);
              expect(accessURIs[i]).to.equal(_accessURIs[i]);
              expect(rewardSupplies[i]).to.equal(_nftSupplies[i]);
            }

            expect(_nftIds.length).to.equal(_accessNftIds.length);

            for (let val of [...Array(nextAccessNftId).keys()]) {
              if (val % 2 == 0) {
                expect(_accessNftIds.includes(val));
              } else {
                expect(_nftIds.includes(val));
              }
            }

            resolve(null);
          },
        );

        setTimeout(() => {
          reject(new Error("Timeout: AccessNFTsCreated"));
        }, 10000);
      });

      await sendGaslessTx(creator, forwarder, relayer, {
        from: creator.address,
        to: accessNft.address,
        data: accessNft.interface.encodeFunctionData("createAccessTokens", [
          creator.address,
          rewardURIs,
          accessURIs,
          rewardSupplies,
          emptyData,
        ]),
      });

      await eventPromise;
    });
  });

  describe("Balances", async () => {
    let rewardIds: number[];
    let accessIds: number[];

    beforeEach(async () => {
      // Grant Minter role to creator
      const MINTER_ROLE = await accessNft.MINTER_ROLE();
      await accessNft.connect(protocolAdmin).grantRole(MINTER_ROLE, creator.address);

      await sendGaslessTx(creator, forwarder, relayer, {
        from: creator.address,
        to: accessNft.address,
        data: accessNft.interface.encodeFunctionData("createAccessTokens", [
          creator.address,
          rewardURIs,
          accessURIs,
          rewardSupplies,
          emptyData,
        ]),
      });

      const nextAccessNftId: number = parseInt((await accessNft.nextTokenId()).toString());
      const expectedRewardIds: number[] = [];
      const expectedAccessIds: number[] = [];
      for (let val of [...Array(nextAccessNftId).keys()]) {
        if (val % 2 == 0) {
          expectedAccessIds.push(val);
        } else {
          expectedRewardIds.push(val);
        }
      }

      rewardIds = expectedRewardIds;
      accessIds = expectedAccessIds;
    });

    it("Should mint all access NFTs to the AccessNFT contract", async () => {
      expect(accessIds.length).to.equal(rewardSupplies.length);

      for (let i = 0; i < rewardSupplies.length; i++) {
        expect(await accessNft.balanceOf(accessNft.address, accessIds[i])).to.equal(rewardSupplies[i]);
      }
    });

    it("Should mint all unredeemed access NFTs to the creator", async () => {
      expect(rewardIds.length).to.equal(rewardSupplies.length);

      for (let i = 0; i < rewardSupplies.length; i++) {
        expect(await accessNft.balanceOf(creator.address, rewardIds[i])).to.equal(rewardSupplies[i]);
      }
    });
  });

  describe("Contract state", function () {
    let nextAccessNftId: number;
    let rewardIds: number[];
    let accessIds: number[];

    beforeEach(async () => {
      // Grant Minter role to creator
      const MINTER_ROLE = await accessNft.MINTER_ROLE();
      await accessNft.connect(protocolAdmin).grantRole(MINTER_ROLE, creator.address);

      await sendGaslessTx(creator, forwarder, relayer, {
        from: creator.address,
        to: accessNft.address,
        data: accessNft.interface.encodeFunctionData("createAccessTokens", [
          creator.address,
          rewardURIs,
          accessURIs,
          rewardSupplies,
          emptyData,
        ]),
      });

      nextAccessNftId = parseInt((await accessNft.nextTokenId()).toString());
      const expectedRewardIds: number[] = [];
      const expectedAccessIds: number[] = [];
      for (let val of [...Array(nextAccessNftId).keys()]) {
        if (val % 2 == 0) {
          expectedAccessIds.push(val);
        } else {
          expectedRewardIds.push(val);
        }
      }

      rewardIds = expectedRewardIds;
      accessIds = expectedAccessIds;
    });

    it("Should increment the contract level tokenId by twice the number of URIs", async () => {
      expect(nextAccessNftId).to.equal(rewardURIs.length * 2);
    });

    it("Should store the NFT info for all NFTs created: redeemed and unredeemed", async () => {
      expect(rewardIds.length).to.equal(accessIds.length);

      for (let i = 0; i < rewardIds.length; i++) {
        const rewardInfo = await accessNft.tokenState(rewardIds[i]);
        expect(rewardInfo.uri).to.equal(rewardURIs[i]);
        expect(rewardInfo.creator).to.equal(creator.address);
        expect(rewardInfo.isRedeemable).to.equal(true);
        expect(rewardInfo.underlyingType).to.equal(0);

        expect(await accessNft.totalSupply(rewardIds[i])).to.equal(rewardSupplies[i]);

        const acessNftInfo = await accessNft.tokenState(accessIds[i]);
        expect(acessNftInfo.uri).to.equal(accessURIs[i]);
        expect(acessNftInfo.creator).to.equal(creator.address);
        expect(acessNftInfo.isRedeemable).to.equal(false);
        expect(acessNftInfo.underlyingType).to.equal(0);

        expect(await accessNft.totalSupply(accessIds[i])).to.equal(rewardSupplies[i]);
      }
    });
  });
});
