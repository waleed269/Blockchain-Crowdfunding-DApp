// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IKYCRegistry_Waleed {
    function isVerified(address user) external view returns (bool);
}

contract Crowdfunding_Waleed {
    enum CampaignStatus {
        Active,
        Completed,
        Withdrawn
    }

    struct Campaign {
        uint256 id;
        string title;
        string description;
        uint256 goal;
        uint256 raised;
        address creator;
        CampaignStatus status;
    }

    IKYCRegistry_Waleed public immutable kycRegistry;
    address public immutable admin;
    Campaign[] private campaigns;
    bool private withdrawalInProgress;

    event CampaignCreated(
        uint256 indexed id,
        address indexed creator,
        string title,
        uint256 goal
    );
    event ContributionReceived(uint256 indexed id, address indexed contributor, uint256 amount);
    event CampaignWithdrawn(uint256 indexed id, address indexed creator, uint256 amount);

    modifier nonReentrant() {
        require(!withdrawalInProgress, "Reentrant call");
        withdrawalInProgress = true;
        _;
        withdrawalInProgress = false;
    }

    constructor(address kycRegistryAddress) {
        require(kycRegistryAddress != address(0), "Invalid KYC registry");
        kycRegistry = IKYCRegistry_Waleed(kycRegistryAddress);
        admin = msg.sender;
    }

    function createCampaign(
        string calldata title,
        string calldata description,
        uint256 goalInEth
    ) external returns (uint256 id) {
        require(
            msg.sender == admin || kycRegistry.isVerified(msg.sender),
            "KYC verification required"
        );
        require(bytes(title).length > 0, "Title is required");
        require(bytes(description).length > 0, "Description is required");
        require(goalInEth > 0, "Goal must be greater than zero");

        id = campaigns.length;
        campaigns.push(
            Campaign({
                id: id,
                title: title,
                description: description,
                goal: goalInEth * 1 ether,
                raised: 0,
                creator: msg.sender,
                status: CampaignStatus.Active
            })
        );
        emit CampaignCreated(id, msg.sender, title, goalInEth * 1 ether);
    }

    function contribute(uint256 id) external payable {
        Campaign storage campaign = _campaignAt(id);
        require(campaign.status == CampaignStatus.Active, "Campaign is not active");
        require(msg.value > 0, "Contribution must be greater than zero");

        campaign.raised += msg.value;
        if (campaign.raised >= campaign.goal) {
            campaign.status = CampaignStatus.Completed;
        }

        emit ContributionReceived(id, msg.sender, msg.value);
    }

    function withdraw(uint256 id) external nonReentrant {
        Campaign storage campaign = _campaignAt(id);
        require(msg.sender == campaign.creator, "Only the creator can withdraw");
        require(campaign.status == CampaignStatus.Completed, "Campaign is not completed");

        uint256 amount = campaign.raised;
        campaign.status = CampaignStatus.Withdrawn;
        (bool success, ) = payable(campaign.creator).call{value: amount}("");
        require(success, "Transfer failed");

        emit CampaignWithdrawn(id, campaign.creator, amount);
    }

    function getCampaign(uint256 id) external view returns (Campaign memory) {
        return _campaignAt(id);
    }

    function getAllCampaigns() external view returns (Campaign[] memory) {
        return campaigns;
    }

    function _campaignAt(uint256 id) private view returns (Campaign storage) {
        require(id < campaigns.length, "Campaign does not exist");
        return campaigns[id];
    }
}
