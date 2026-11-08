const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("KYCRegistry_Waleed and Crowdfunding_Waleed", function () {
  let admin;
  let creator;
  let contributor;
  let other;
  let registry;
  let crowdfunding;

  async function approve(address, name = "Waleed Saeed") {
    await registry.connect(creator).submitKYC(name, "12345-1234567-1");
    await registry.connect(admin).approveKYC(address);
  }

  beforeEach(async function () {
    [admin, creator, contributor, other] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("KYCRegistry_Waleed");
    registry = await Registry.deploy();
    await registry.waitForDeployment();

    const Crowdfunding = await ethers.getContractFactory("Crowdfunding_Waleed");
    crowdfunding = await Crowdfunding.deploy(await registry.getAddress());
    await crowdfunding.waitForDeployment();
  });

  describe("KYC", function () {
    it("submits a request and lets only the admin approve it", async function () {
      await expect(registry.connect(creator).submitKYC("Waleed Saeed", "12345-1234567-1"))
        .to.emit(registry, "KYCSubmitted")
        .withArgs(creator.address, "Waleed Saeed");

      expect(await registry.getKYCStatus(creator.address)).to.equal(1);
      expect(await registry.isVerified(creator.address)).to.equal(false);
      await expect(registry.connect(other).approveKYC(creator.address)).to.be.revertedWith(
        "Only admin"
      );

      await expect(registry.connect(admin).approveKYC(creator.address))
        .to.emit(registry, "KYCApproved")
        .withArgs(creator.address, "Waleed Saeed");
      expect(await registry.isVerified(creator.address)).to.equal(true);
    });

    it("rejects empty data, duplicate pending requests, and non-pending decisions", async function () {
      await expect(registry.connect(creator).submitKYC("", "123"))
        .to.be.revertedWith("Name is required");
      await expect(registry.connect(creator).submitKYC("Waleed Saeed", ""))
        .to.be.revertedWith("CNIC is required");

      await registry.connect(creator).submitKYC("Waleed Saeed", "12345-1234567-1");
      await expect(
        registry.connect(creator).submitKYC("Waleed Saeed", "12345-1234567-1")
      ).to.be.revertedWith("KYC request is already pending");
      await registry.connect(admin).rejectKYC(creator.address);
      expect(await registry.getKYCStatus(creator.address)).to.equal(3);
      await expect(registry.connect(admin).approveKYC(creator.address)).to.be.revertedWith(
        "No pending request"
      );

      await registry.connect(creator).submitKYC("Waleed Saeed", "12345-1234567-1");
      expect(await registry.getKYCStatus(creator.address)).to.equal(1);
      expect((await registry.getAllRequests()).length).to.equal(1);
    });
  });

  describe("Campaigns and contributions", function () {
    it("allows only verified users or the admin to create campaigns", async function () {
      await expect(
        crowdfunding.connect(creator).createCampaign("Project", "Description", 2)
      ).to.be.revertedWith("KYC verification required");

      await expect(crowdfunding.connect(admin).createCampaign("Admin project", "Description", 1))
        .to.emit(crowdfunding, "CampaignCreated")
        .withArgs(0, admin.address, "Admin project", ethers.parseEther("1"));

      await approve(creator.address);
      await expect(crowdfunding.connect(creator).createCampaign("Project", "Description", 2))
        .to.emit(crowdfunding, "CampaignCreated")
        .withArgs(1, creator.address, "Project", ethers.parseEther("2"));

      const campaign = await crowdfunding.getCampaign(1);
      expect(campaign.title).to.equal("Project");
      expect(campaign.description).to.equal("Description");
      expect(campaign.goal).to.equal(ethers.parseEther("2"));
      expect(campaign.creator).to.equal(creator.address);
      expect(campaign.status).to.equal(0);
    });

    it("rejects invalid campaign details and unknown campaign IDs", async function () {
      await expect(crowdfunding.connect(admin).createCampaign("", "Description", 1)).to.be.revertedWith(
        "Title is required"
      );
      await expect(crowdfunding.connect(admin).createCampaign("Title", "", 1)).to.be.revertedWith(
        "Description is required"
      );
      await expect(crowdfunding.connect(admin).createCampaign("Title", "Description", 0))
        .to.be.revertedWith("Goal must be greater than zero");
      await expect(crowdfunding.getCampaign(0)).to.be.revertedWith("Campaign does not exist");
    });

    it("accepts contributions from unverified accounts and completes at the goal", async function () {
      await crowdfunding.connect(admin).createCampaign("Project", "Description", 2);

      await expect(
        crowdfunding.connect(contributor).contribute(0, { value: ethers.parseEther("1") })
      )
        .to.emit(crowdfunding, "ContributionReceived")
        .withArgs(0, contributor.address, ethers.parseEther("1"));
      expect((await crowdfunding.getCampaign(0)).status).to.equal(0);

      await crowdfunding.connect(other).contribute(0, { value: ethers.parseEther("1.5") });
      const campaign = await crowdfunding.getCampaign(0);
      expect(campaign.raised).to.equal(ethers.parseEther("2.5"));
      expect(campaign.status).to.equal(1);
      expect((await crowdfunding.getAllCampaigns()).length).to.equal(1);
    });

    it("rejects zero contributions, inactive campaigns, and invalid IDs", async function () {
      await crowdfunding.connect(admin).createCampaign("Project", "Description", 1);
      await expect(crowdfunding.connect(contributor).contribute(0)).to.be.revertedWith(
        "Contribution must be greater than zero"
      );
      await expect(
        crowdfunding.connect(contributor).contribute(1, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("Campaign does not exist");

      await crowdfunding.connect(contributor).contribute(0, { value: ethers.parseEther("1") });
      await expect(
        crowdfunding.connect(contributor).contribute(0, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("Campaign is not active");
    });
  });

  describe("Withdrawals", function () {
    it("allows only the creator to withdraw after completion", async function () {
      await approve(creator.address);
      await crowdfunding.connect(creator).createCampaign("Project", "Description", 1);

      await expect(crowdfunding.connect(creator).withdraw(0)).to.be.revertedWith(
        "Campaign is not completed"
      );
      await crowdfunding.connect(contributor).contribute(0, { value: ethers.parseEther("1") });
      await expect(crowdfunding.connect(other).withdraw(0)).to.be.revertedWith(
        "Only the creator can withdraw"
      );

      await expect(crowdfunding.connect(creator).withdraw(0))
        .to.emit(crowdfunding, "CampaignWithdrawn")
        .withArgs(0, creator.address, ethers.parseEther("1"));
      expect((await crowdfunding.getCampaign(0)).status).to.equal(2);
      expect(await ethers.provider.getBalance(await crowdfunding.getAddress())).to.equal(0);
      await expect(crowdfunding.connect(creator).withdraw(0)).to.be.revertedWith(
        "Campaign is not completed"
      );
    });
  });
});
