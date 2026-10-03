// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title LUCR Treasury
 * @notice Central vault for LUCR token reserves. Controls module budgets,
 *         release authority, audit events, and deterministic governance flow.
 */
contract Treasury {
    IERC20 public immutable lucr;

    address public admin;
    mapping(address => uint256) public moduleBudgets;

    event AdminChanged(address indexed oldAdmin, address indexed newAdmin);
    event BudgetApproved(address indexed module, uint256 amount);
    event BudgetRevoked(address indexed module, uint256 amount);
    event FundsReleased(address indexed module, uint256 amount);
    event TreasuryFunded(address indexed from, uint256 amount);

    modifier onlyAdmin() {
        require(msg.sender == admin, "NOT_ADMIN");
        _;
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

    function deposit(uint256 amount) external {
        require(amount > 0, "AMOUNT_ZERO");
        require(lucr.transferFrom(msg.sender, address(this), amount), "TRANSFER_FAIL");
        emit TreasuryFunded(msg.sender, amount);
    }

    function approveBudget(address module, uint256 amount) external onlyAdmin {
        require(module != address(0), "MODULE_ZERO");
        moduleBudgets[module] += amount;
        emit BudgetApproved(module, amount);
    }

    function revokeBudget(address module, uint256 amount) external onlyAdmin {
        require(moduleBudgets[module] >= amount, "BUDGET_LOW");
        moduleBudgets[module] -= amount;
        emit BudgetRevoked(module, amount);
    }

    function releaseFunds(address module, uint256 amount) external onlyAdmin {
        require(module != address(0), "MODULE_ZERO");
        require(moduleBudgets[module] >= amount, "BUDGET_EXCEEDED");

        moduleBudgets[module] -= amount;

        require(lucr.transfer(module, amount), "TRANSFER_FAIL");

        emit FundsReleased(module, amount);
    }
}
