// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title Munisible Task Force
 * @notice Municipal task force and project manager funded by LUCR Treasury.
 *         Assumes Treasury releases LUCR directly to this contract.
 */
contract MunisibleTaskForce {
    IERC20 public immutable lucr;

    address public admin;
    mapping(address => bool) public managers;
    bool private _entered;

    struct TaskForce {
        uint256 id;
        string name;
        string jurisdiction;
        bool active;
    }

    struct Project {
        uint256 id;
        uint256 taskForceId;
        string name;
        string description;
        uint256 budgetLucr;
        uint256 spentLucr;
        bool active;
    }

    uint256 public nextTaskForceId;
    uint256 public nextProjectId;

    mapping(uint256 => TaskForce) public taskForces;
    mapping(uint256 => Project) public projects;

    event AdminChanged(address indexed oldAdmin, address indexed newAdmin);
    event ManagerSet(address indexed manager, bool enabled);
    event TaskForceCreated(uint256 indexed id, string name, string jurisdiction);
    event TaskForceStatusChanged(uint256 indexed id, bool active);
    event ProjectCreated(
        uint256 indexed id,
        uint256 indexed taskForceId,
        string name,
        uint256 budgetLucr
    );
    event ProjectStatusChanged(uint256 indexed id, bool active);
    event ProjectFunded(
        uint256 indexed projectId,
        address indexed recipient,
        uint256 amountLucr
    );

    modifier onlyAdmin() {
        require(msg.sender == admin, "NOT_ADMIN");
        _;
    }

    modifier onlyManager() {
        require(managers[msg.sender] || msg.sender == admin, "NOT_MANAGER");
        _;
    }

    modifier nonReentrant() {
        require(!_entered, "REENTRANT");
        _entered = true;
        _;
        _entered = false;
    }

    constructor(address _lucrToken, address _admin) {
        require(_lucrToken != address(0), "LUCR_ZERO");
        require(_admin != address(0), "ADMIN_ZERO");
        lucr = IERC20(_lucrToken);
        admin = _admin;
    }

    function setAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "ADMIN_ZERO");
        emit AdminChanged(admin, newAdmin);
        admin = newAdmin;
    }

    function setManager(address manager, bool enabled) external onlyAdmin {
        require(manager != address(0), "MANAGER_ZERO");
        managers[manager] = enabled;
        emit ManagerSet(manager, enabled);
    }

    function createTaskForce(
        string calldata name,
        string calldata jurisdiction
    ) external onlyManager returns (uint256 id) {
        id = ++nextTaskForceId;

        taskForces[id] = TaskForce({
            id: id,
            name: name,
            jurisdiction: jurisdiction,
            active: true
        });

        emit TaskForceCreated(id, name, jurisdiction);
    }

    function setTaskForceActive(uint256 taskForceId, bool active)
        external
        onlyManager
    {
        TaskForce storage tf = taskForces[taskForceId];
        require(tf.id != 0, "TF_NOT_FOUND");
        tf.active = active;
        emit TaskForceStatusChanged(taskForceId, active);
    }

    function createProject(
        uint256 taskForceId,
        string calldata name,
        string calldata description,
        uint256 budgetLucr
    ) external onlyManager returns (uint256 id) {
        TaskForce storage tf = taskForces[taskForceId];
        require(tf.id != 0 && tf.active, "TF_INVALID");
        require(budgetLucr > 0, "BUDGET_ZERO");

        id = ++nextProjectId;

        projects[id] = Project({
            id: id,
            taskForceId: taskForceId,
            name: name,
            description: description,
            budgetLucr: budgetLucr,
            spentLucr: 0,
            active: true
        });

        emit ProjectCreated(id, taskForceId, name, budgetLucr);
    }

    function setProjectActive(uint256 projectId, bool active)
        external
        onlyManager
    {
        Project storage p = projects[projectId];
        require(p.id != 0, "PROJ_NOT_FOUND");
        p.active = active;
        emit ProjectStatusChanged(projectId, active);
    }

    function fundProject(
        uint256 projectId,
        address recipient,
        uint256 amountLucr
    ) external onlyManager nonReentrant {
        require(recipient != address(0), "RECIPIENT_ZERO");
        require(amountLucr > 0, "AMOUNT_ZERO");

        Project storage p = projects[projectId];
        require(p.id != 0 && p.active, "PROJ_INVALID");
        require(p.spentLucr + amountLucr <= p.budgetLucr, "BUDGET_EXCEEDED");

        uint256 available = lucr.balanceOf(address(this));
        require(available >= amountLucr, "INSUFFICIENT_TREASURY_FUNDS");
        p.spentLucr += amountLucr;
        require(lucr.transfer(recipient, amountLucr), "LUCR_TRANSFER_FAIL");

        emit ProjectFunded(projectId, recipient, amountLucr);
    }
}
