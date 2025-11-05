pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract SalaryBench_FHE is ZamaEthereumConfig {
    struct EmployeeData {
        string employeeId;                    
        euint32 encryptedSalary;        
        uint256 industryCode;          
        uint256 yearsExperience;          
        string jobTitle;            
        address employeeAddress;               
        uint256 submissionTime;             
        uint32 decryptedSalary; 
        bool isVerified; 
    }
    
    mapping(string => EmployeeData) public employeeData;
    string[] public employeeIds;
    
    event EmployeeDataCreated(string indexed employeeId, address indexed employeeAddress);
    event DecryptionVerified(string indexed employeeId, uint32 decryptedSalary);
    
    constructor() ZamaEthereumConfig() {
    }
    
    function createEmployeeData(
        string calldata employeeId,
        string calldata jobTitle,
        externalEuint32 encryptedSalary,
        bytes calldata inputProof,
        uint256 industryCode,
        uint256 yearsExperience
    ) external {
        require(bytes(employeeData[employeeId].employeeId).length == 0, "Employee data already exists");
        
        require(FHE.isInitialized(FHE.fromExternal(encryptedSalary, inputProof)), "Invalid encrypted input");
        
        employeeData[employeeId] = EmployeeData({
            employeeId: employeeId,
            encryptedSalary: FHE.fromExternal(encryptedSalary, inputProof),
            industryCode: industryCode,
            yearsExperience: yearsExperience,
            jobTitle: jobTitle,
            employeeAddress: msg.sender,
            submissionTime: block.timestamp,
            decryptedSalary: 0,
            isVerified: false
        });
        
        FHE.allowThis(employeeData[employeeId].encryptedSalary);
        FHE.makePubliclyDecryptable(employeeData[employeeId].encryptedSalary);
        
        employeeIds.push(employeeId);
        
        emit EmployeeDataCreated(employeeId, msg.sender);
    }
    
    function verifyDecryption(
        string calldata employeeId, 
        bytes memory abiEncodedClearValue,
        bytes memory decryptionProof
    ) external {
        require(bytes(employeeData[employeeId].employeeId).length > 0, "Employee data does not exist");
        require(!employeeData[employeeId].isVerified, "Data already verified");
        
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(employeeData[employeeId].encryptedSalary);
        
        FHE.checkSignatures(cts, abiEncodedClearValue, decryptionProof);
        
        uint32 decodedValue = abi.decode(abiEncodedClearValue, (uint32));
        
        employeeData[employeeId].decryptedSalary = decodedValue;
        employeeData[employeeId].isVerified = true;
        
        emit DecryptionVerified(employeeId, decodedValue);
    }
    
    function getEncryptedSalary(string calldata employeeId) external view returns (euint32) {
        require(bytes(employeeData[employeeId].employeeId).length > 0, "Employee data does not exist");
        return employeeData[employeeId].encryptedSalary;
    }
    
    function getEmployeeData(string calldata employeeId) external view returns (
        string memory jobTitle,
        uint256 industryCode,
        uint256 yearsExperience,
        address employeeAddress,
        uint256 submissionTime,
        bool isVerified,
        uint32 decryptedSalary
    ) {
        require(bytes(employeeData[employeeId].employeeId).length > 0, "Employee data does not exist");
        EmployeeData storage data = employeeData[employeeId];
        
        return (
            data.jobTitle,
            data.industryCode,
            data.yearsExperience,
            data.employeeAddress,
            data.submissionTime,
            data.isVerified,
            data.decryptedSalary
        );
    }
    
    function getAllEmployeeIds() external view returns (string[] memory) {
        return employeeIds;
    }
    
    function isAvailable() public pure returns (bool) {
        return true;
    }
}

