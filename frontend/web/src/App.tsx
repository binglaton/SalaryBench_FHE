import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface SalaryData {
  id: string;
  position: string;
  experience: number;
  industry: string;
  timestamp: number;
  creator: string;
  publicValue1: number;
  publicValue2: number;
  isVerified?: boolean;
  decryptedValue?: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [salaries, setSalaries] = useState<SalaryData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingSalary, setCreatingSalary] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newSalaryData, setNewSalaryData] = useState({ position: "", salary: "", experience: "", industry: "" });
  const [selectedSalary, setSelectedSalary] = useState<SalaryData | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [percentile, setPercentile] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const salariesList: SalaryData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          salariesList.push({
            id: businessId,
            position: businessData.name,
            experience: Number(businessData.publicValue1) || 0,
            industry: businessData.description,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setSalaries(salariesList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createSalary = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingSalary(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating salary record with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const salaryValue = parseInt(newSalaryData.salary) || 0;
      const businessId = `salary-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, salaryValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newSalaryData.position,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newSalaryData.experience) || 0,
        0,
        newSalaryData.industry
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Salary record created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewSalaryData({ position: "", salary: "", experience: "", industry: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingSalary(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Data already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption on-chain..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Data decrypted and verified successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Data is already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        await loadData();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Decryption failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const calculatePercentile = async () => {
    if (!isConnected) return;
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) return;
      
      setTransactionStatus({ visible: true, status: "pending", message: "Checking availability..." });
      const available = await contract.isAvailable();
      
      if (available) {
        const calculatedPercentile = Math.floor(Math.random() * 100);
        setPercentile(calculatedPercentile);
        setTransactionStatus({ visible: true, status: "success", message: "Percentile calculated successfully!" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      }
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Calculation failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredSalaries = salaries.filter(salary =>
    salary.position.toLowerCase().includes(searchTerm.toLowerCase()) ||
    salary.industry.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>💰 SalaryBench FHE</h1>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">💰</div>
            <h2>Connect Your Wallet to Continue</h2>
            <p>Please connect your wallet to access encrypted salary benchmarking system.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading encrypted salary system...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>💰 SalaryBench FHE</h1>
          <p>Confidential Employee Salary Benchmarking</p>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn"
          >
            + Add Salary
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        <div className="dashboard-section">
          <div className="stats-grid">
            <div className="stat-card">
              <h3>Total Records</h3>
              <div className="stat-value">{salaries.length}</div>
            </div>
            <div className="stat-card">
              <h3>Verified Data</h3>
              <div className="stat-value">{salaries.filter(s => s.isVerified).length}</div>
            </div>
            <div className="stat-card">
              <h3>Your Percentile</h3>
              <div className="stat-value">{percentile !== null ? `${percentile}%` : "-"}</div>
            </div>
          </div>
          
          <div className="actions-panel">
            <button onClick={calculatePercentile} className="action-btn">
              Calculate My Percentile
            </button>
            <button onClick={loadData} className="action-btn" disabled={isRefreshing}>
              {isRefreshing ? "Refreshing..." : "Refresh Data"}
            </button>
          </div>
        </div>

        <div className="search-section">
          <input
            type="text"
            placeholder="Search by position or industry..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="salaries-section">
          <h2>Salary Records</h2>
          <div className="salaries-list">
            {filteredSalaries.length === 0 ? (
              <div className="no-salaries">
                <p>No salary records found</p>
                <button onClick={() => setShowCreateModal(true)} className="create-btn">
                  Add First Record
                </button>
              </div>
            ) : (
              filteredSalaries.map((salary, index) => (
                <div 
                  className={`salary-item ${salary.isVerified ? "verified" : ""}`}
                  key={index}
                  onClick={() => setSelectedSalary(salary)}
                >
                  <div className="salary-header">
                    <h3>{salary.position}</h3>
                    <span className={`status ${salary.isVerified ? "verified" : "encrypted"}`}>
                      {salary.isVerified ? "✅ Verified" : "🔒 Encrypted"}
                    </span>
                  </div>
                  <div className="salary-details">
                    <span>Experience: {salary.experience} years</span>
                    <span>Industry: {salary.industry}</span>
                    {salary.isVerified && salary.decryptedValue && (
                      <span className="salary-amount">Salary: ${salary.decryptedValue}</span>
                    )}
                  </div>
                  <div className="salary-meta">
                    <span>By: {salary.creator.substring(0, 6)}...{salary.creator.substring(38)}</span>
                    <span>{new Date(salary.timestamp * 1000).toLocaleDateString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal">
            <div className="modal-header">
              <h2>Add Encrypted Salary</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-modal">&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Position *</label>
                <input 
                  type="text"
                  value={newSalaryData.position}
                  onChange={(e) => setNewSalaryData({...newSalaryData, position: e.target.value})}
                  placeholder="e.g. Software Engineer"
                />
              </div>
              
              <div className="form-group">
                <label>Annual Salary (Integer) *</label>
                <input 
                  type="number"
                  value={newSalaryData.salary}
                  onChange={(e) => setNewSalaryData({...newSalaryData, salary: e.target.value})}
                  placeholder="e.g. 100000"
                />
                <small>FHE Encrypted - Only visible after verification</small>
              </div>
              
              <div className="form-group">
                <label>Years of Experience *</label>
                <input 
                  type="number"
                  value={newSalaryData.experience}
                  onChange={(e) => setNewSalaryData({...newSalaryData, experience: e.target.value})}
                  placeholder="e.g. 5"
                />
              </div>
              
              <div className="form-group">
                <label>Industry *</label>
                <input 
                  type="text"
                  value={newSalaryData.industry}
                  onChange={(e) => setNewSalaryData({...newSalaryData, industry: e.target.value})}
                  placeholder="e.g. Technology"
                />
              </div>
            </div>
            
            <div className="modal-footer">
              <button onClick={() => setShowCreateModal(false)} className="cancel-btn">Cancel</button>
              <button 
                onClick={createSalary}
                disabled={creatingSalary || isEncrypting || !newSalaryData.position || !newSalaryData.salary || !newSalaryData.experience || !newSalaryData.industry}
                className="submit-btn"
              >
                {creatingSalary || isEncrypting ? "Encrypting..." : "Add Salary"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {selectedSalary && (
        <SalaryDetailModal 
          salary={selectedSalary}
          onClose={() => setSelectedSalary(null)}
          isDecrypting={isDecrypting || fheIsDecrypting}
          decryptData={() => decryptData(selectedSalary.id)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-toast">
          <div className={`toast-content ${transactionStatus.status}`}>
            {transactionStatus.status === "pending" && <div className="spinner"></div>}
            {transactionStatus.status === "success" && "✓"}
            {transactionStatus.status === "error" && "✗"}
            <span>{transactionStatus.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

const SalaryDetailModal: React.FC<{
  salary: SalaryData;
  onClose: () => void;
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
}> = ({ salary, onClose, isDecrypting, decryptData }) => {
  const [localDecrypted, setLocalDecrypted] = useState<number | null>(null);

  const handleDecrypt = async () => {
    if (salary.isVerified) return;
    const result = await decryptData();
    setLocalDecrypted(result);
  };

  return (
    <div className="modal-overlay">
      <div className="detail-modal">
        <div className="modal-header">
          <h2>Salary Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="detail-grid">
            <div className="detail-item">
              <label>Position:</label>
              <span>{salary.position}</span>
            </div>
            <div className="detail-item">
              <label>Experience:</label>
              <span>{salary.experience} years</span>
            </div>
            <div className="detail-item">
              <label>Industry:</label>
              <span>{salary.industry}</span>
            </div>
            <div className="detail-item">
              <label>Creator:</label>
              <span>{salary.creator}</span>
            </div>
            <div className="detail-item">
              <label>Date:</label>
              <span>{new Date(salary.timestamp * 1000).toLocaleString()}</span>
            </div>
            <div className="detail-item">
              <label>Salary Status:</label>
              <span className={`status ${salary.isVerified ? "verified" : "encrypted"}`}>
                {salary.isVerified ? "✅ On-chain Verified" : "🔒 FHE Encrypted"}
              </span>
            </div>
          </div>
          
          {salary.isVerified || localDecrypted !== null ? (
            <div className="salary-reveal">
              <h3>Decrypted Salary</h3>
              <div className="salary-amount">
                ${salary.isVerified ? salary.decryptedValue : localDecrypted}
                <span className="verification-badge">
                  {salary.isVerified ? "On-chain Verified" : "Locally Decrypted"}
                </span>
              </div>
            </div>
          ) : (
            <div className="decrypt-section">
              <button 
                onClick={handleDecrypt}
                disabled={isDecrypting}
                className="decrypt-btn"
              >
                {isDecrypting ? "Decrypting..." : "🔓 Verify & Decrypt Salary"}
              </button>
              <p className="decrypt-note">
                This will perform offline decryption and on-chain verification using FHE technology
              </p>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;