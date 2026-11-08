// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract KYCRegistry_Waleed {
    enum KYCStatus {
        None,
        Pending,
        Approved,
        Rejected
    }

    struct KYCRequest {
        address user;
        string name;
        string cnic;
        KYCStatus status;
    }

    address public immutable admin;
    mapping(address => KYCRequest) private requests;
    address[] private requesters;

    event KYCSubmitted(address indexed user, string name);
    event KYCApproved(address indexed user, string name);
    event KYCRejected(address indexed user);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function submitKYC(string calldata name, string calldata cnic) external {
        require(bytes(name).length > 0, "Name is required");
        require(bytes(cnic).length > 0, "CNIC is required");
        KYCStatus current = requests[msg.sender].status;
        require(current != KYCStatus.Pending, "KYC request is already pending");
        require(current != KYCStatus.Approved, "KYC is already approved");

        if (current == KYCStatus.None) {
            requesters.push(msg.sender);
        }

        requests[msg.sender] = KYCRequest({
            user: msg.sender,
            name: name,
            cnic: cnic,
            status: KYCStatus.Pending
        });
        emit KYCSubmitted(msg.sender, name);
    }

    function approveKYC(address user) external onlyAdmin {
        require(requests[user].status == KYCStatus.Pending, "No pending request");
        requests[user].status = KYCStatus.Approved;
        emit KYCApproved(user, requests[user].name);
    }

    function rejectKYC(address user) external onlyAdmin {
        require(requests[user].status == KYCStatus.Pending, "No pending request");
        requests[user].status = KYCStatus.Rejected;
        emit KYCRejected(user);
    }

    function isVerified(address user) external view returns (bool) {
        return requests[user].status == KYCStatus.Approved;
    }

    function getKYCStatus(address user) external view returns (KYCStatus) {
        return requests[user].status;
    }

    function getKYCRequest(address user) external view returns (KYCRequest memory) {
        return requests[user];
    }

    function getAllRequests() external view onlyAdmin returns (KYCRequest[] memory allRequests) {
        allRequests = new KYCRequest[](requesters.length);
        for (uint256 i = 0; i < requesters.length; i++) {
            allRequests[i] = requests[requesters[i]];
        }
    }
}
