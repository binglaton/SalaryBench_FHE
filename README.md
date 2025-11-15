# SalaryBench_FHE

SalaryBench_FHE is a confidential employee salary benchmarking tool powered by Zama's Fully Homomorphic Encryption (FHE) technology. This application allows employees to securely input their salaries and conduct homomorphic queries to determine their position within industry salary distributions without revealing sensitive information.

## The Problem

In today’s competitive job market, salary transparency is crucial for both employees and employers. However, sharing salary information can lead to privacy concerns and potential discrimination. Traditional salary surveys typically require individuals to disclose their salaries, risking exposure of this sensitive data. Cleartext data can be dangerous in these contexts, as it opens individuals to potential biases and breaches of confidentiality. 

## The Zama FHE Solution

SalaryBench_FHE addresses these privacy concerns through the implementation of Fully Homomorphic Encryption. By utilizing FHE, employees can securely input their salary data, which remains encrypted while allowing computations to be performed directly on it. 

Using Zama's libraries, such as fhevm, the application enables employees to conduct salary queries on encrypted inputs, ensuring that neither their salary nor the results of the queries are exposed in cleartext. This innovative approach empowers employees to benchmark their salaries confidently, contributing to a more transparent and fair workplace.

## Key Features

- 🔒 **Privacy Protection:** Employees can input their salaries securely without revealing any identifiable information.
- 📊 **Confidential Benchmarking:** Users can retrieve their salary percentiles within the industry anonymously.
- 🔍 **Computation on Encrypted Data:** Perform complex queries on encrypted salaries using homomorphic encryption.
- 💡 **User-Friendly Interface:** A clean and intuitive UI that simplifies data entry and report generation.
- 📈 **Data Visualization:** Dynamic graphs and charts illustrate salary trends and benchmarks without compromising privacy.

## Technical Architecture & Stack

The architecture of SalaryBench_FHE is designed to maximize privacy while ensuring a smooth user experience. The following technologies constitute the core stack:

- **Core Privacy Engine:** Zama’s fhevm for processing encrypted inputs.
- **Frontend:** HTML, CSS, and JavaScript for an interactive user interface.
- **Backend:** Node.js for handling server-side logic.
- **Database:** NoSQL database for storing encrypted salary data securely.

## Smart Contract / Core Logic

Below is a simplified representation of how SalaryBench_FHE leverages Zama's technology to compute salary percentiles securely:

```solidity
pragma solidity ^0.8.0;

import "TFHE.sol";

contract SalaryBenchmark {
    mapping(address => uint64) public salaries;
    
    function inputSalary(uint64 encryptedSalary) public {
        salaries[msg.sender] = encryptedSalary; 
    }
    
    function getPercentile(uint64 querySalary) public view returns (uint8) {
        // Perform homomorphic computation to determine percentile
        uint64 result = TFHE.add(salaries[msg.sender], querySalary);
        return TFHE.decrypt(result);
    }
}
```

This snippet illustrates the basic structure of a smart contract that inputs and processes encrypted salary data, allowing employees to access percentile information securely.

## Directory Structure

The directory structure for SalaryBench_FHE is as follows:

```
SalaryBench_FHE/
├── .gitignore
├── .env
├── src/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── contract/
│   └── SalaryBenchmark.sol
├── README.md
└── package.json
```

## Installation & Setup

### Prerequisites

To run SalaryBench_FHE, ensure you have the following installed:

- Node.js
- npm (Node Package Manager)

### Installation Steps

1. **Install Dependencies**
   Use npm to install the required dependencies:

   ```bash
   npm install
   npm install fhevm
   ```

2. **Smart Contract Setup**
   Compile the smart contract using Hardhat or any Ethereum development framework:

   ```bash
   npx hardhat compile
   ```

## Build & Run

To start the SalaryBench_FHE application, follow these steps:

1. Run the following command to start the development server:

   ```bash
   npm start
   ```

2. Access the application via your web browser to input and query salary data.

## Acknowledgements

We would like to extend our gratitude to Zama for providing the open-source FHE primitives that make this project possible. Their groundbreaking advancements in Fully Homomorphic Encryption empower developers to build secure applications that prioritize user privacy.

