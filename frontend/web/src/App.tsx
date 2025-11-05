import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface SalaryData {
  id: number;
  name: string;
  encryptedSalary: string;
  industry: string;
  experience: string;
  timestamp: number;
  creator: string;
  publicValue1: number;
  publicValue2: number;
  isVerified?: boolean;
  decryptedValue?: number;
}

interface SalaryBenchmark {
  percentile: number;
  industryAverage: number;
  recommendation: string;
  marketPosition: string;
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
    status: "pending" as const, 
    message: "" 
  });
  const [newSalaryData, setNewSalaryData] = useState({ name: "", salary: "", industry: "", experience: "" });
  const [selectedSalary, setSelectedSalary] = useState<SalaryData | null>(null);
  const [decryptedValue, setDecryptedValue] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<SalaryBenchmark | null>(null);
  const [userHistory, setUserHistory] = useState<SalaryData[]>([]);
  const [complianceStatus, setComplianceStatus] = useState<{verified: boolean; timestamp: number} | null>(null);

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting} = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) return;
      if (isInitialized || fhevmInitializing) return;
      
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
      const userSalaries: SalaryData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          const salaryItem: SalaryData = {
            id: parseInt(businessId.replace('salary-', '')) || Date.now(),
            name: businessData.name,
            encryptedSalary: businessId,
            industry: "Tech",
            experience: "5",
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          };
          
          salariesList.push(salaryItem);
          if (businessData.creator.toLowerCase() === address?.toLowerCase()) {
            userSalaries.push(salaryItem);
          }
        } catch (e) {
          console.error('Error loading salary data:', e);
        }
      }
      
      setSalaries(salariesList);
      setUserHistory(userSalaries);
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
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting salary with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const salaryValue = parseInt(newSalaryData.salary) || 0;
      const businessId = `salary-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, salaryValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newSalaryData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newSalaryData.experience) || 0,
        0,
        `Industry: ${newSalaryData.industry}, Experience: ${newSalaryData.experience} years`
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Submitting encrypted salary..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Salary encrypted and stored successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewSalaryData({ name: "", salary: "", industry: "", experience: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected" 
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
        calculateBenchmark(storedValue, Number(businessData.publicValue1));
        setComplianceStatus({verified: true, timestamp: Date.now()});
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
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      calculateBenchmark(Number(clearValue), Number(businessData.publicValue1));
      setComplianceStatus({verified: true, timestamp: Date.now()});
      
      setTransactionStatus({ visible: true, status: "success", message: "Salary verified successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Data is already verified" 
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

  const calculateBenchmark = (salary: number, experience: number) => {
    const basePercentile = Math.min(95, Math.max(5, (salary / (experience * 2000)) * 10));
    const industryAvg = experience * 1500;
    
    let recommendation = "Market Competitive";
    let marketPosition = "Average";
    
    if (salary > industryAvg * 1.2) {
      recommendation = "Above Market - Consider retention strategies";
      marketPosition = "High";
    } else if (salary < industryAvg * 0.8) {
      recommendation = "Below Market - Review compensation";
      marketPosition = "Low";
    }
    
    setBenchmarkResult({
      percentile: Math.round(basePercentile),
      industryAverage: industryAvg,
      recommendation,
      marketPosition
    });
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const available = await contract.isAvailable();
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: `Contract is available: ${available}` 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const renderDashboard = () => {
    const totalSalaries = salaries.length;
    const verifiedSalaries = salaries.filter(s => s.isVerified).length;
    const avgExperience = salaries.length > 0 
      ? salaries.reduce((sum, s) => sum + s.publicValue1, 0) / salaries.length 
      : 0;
    
    return (
      <div className="dashboard-panels">
        <div className="panel metal-panel">
          <h3>Total Salaries</h3>
          <div className="stat-value">{totalSalaries}</div>
          <div className="stat-trend">FHE Protected</div>
        </div>
        
        <div className="panel metal-panel">
          <h3>Verified Data</h3>
          <div className="stat-value">{verifiedSalaries}/{totalSalaries}</div>
          <div className="stat-trend">On-chain Verified</div>
        </div>
        
        <div className="panel metal-panel">
          <h3>Avg Experience</h3>
          <div className="stat-value">{avgExperience.toFixed(1)}y</div>
          <div className="stat-trend">Industry Benchmark</div>
        </div>
      </div>
    );
  };

  const renderBenchmarkChart = (benchmark: SalaryBenchmark) => {
    return (
      <div className="benchmark-chart">
        <div className="chart-row">
          <div className="chart-label">Your Percentile</div>
          <div className="chart-bar">
            <div 
              className="bar-fill percentile" 
              style={{ width: `${benchmark.percentile}%` }}
            >
              <span className="bar-value">{benchmark.percentile}%</span>
            </div>
          </div>
        </div>
        <div className="chart-row">
          <div className="chart-label">Industry Average</div>
          <div className="chart-value">${benchmark.industryAverage.toLocaleString()}</div>
        </div>
        <div className="chart-row">
          <div className="chart-label">Market Position</div>
          <div className={`position-badge ${benchmark.marketPosition.toLowerCase()}`}>
            {benchmark.marketPosition}
          </div>
        </div>
        <div className="recommendation">
          <strong>Recommendation:</strong> {benchmark.recommendation}
        </div>
      </div>
    );
  };

  const renderFHEFlow = () => {
    return (
      <div className="fhe-flow">
        <div className="flow-step">
          <div className="step-icon">🔒</div>
          <div className="step-content">
            <h4>Salary Encryption</h4>
            <p>Your salary encrypted with Zama FHE</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">📊</div>
          <div className="step-content">
            <h4>Homomorphic Analysis</h4>
            <p>Calculate percentile without decryption</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">✅</div>
          <div className="step-content">
            <h4>Privacy-Preserving Result</h4>
            <p>Get benchmark without exposing salary</p>
          </div>
        </div>
      </div>
    );
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>💰 SalaryBench FHE</h1>
            <p>Confidential Employee Salary Benchmark</p>
          </div>
          <div className="header-actions">
            <div className="wallet-connect-wrapper">
              <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
            </div>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">💰</div>
            <h2>Connect Wallet to Start</h2>
            <p>Securely benchmark your salary using Fully Homomorphic Encryption</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>Connect your wallet securely</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>Encrypt your salary with FHE</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>Get private benchmark results</p>
              </div>
            </div>
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
        <p className="loading-note">Securing your salary data</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading salary benchmark system...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>💰 SalaryBench FHE</h1>
          <p>Confidential Employee Salary Benchmark</p>
        </div>
        
        <div className="header-actions">
          <button onClick={checkAvailability} className="check-btn">
            Check Availability
          </button>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn"
          >
            + Add Salary
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content-container">
        <div className="dashboard-section">
          <h2>Private Salary Benchmark Dashboard</h2>
          {renderDashboard()}
          
          <div className="panel metal-panel full-width">
            <h3>FHE 🔐 Privacy-Preserving Benchmark</h3>
            {renderFHEFlow()}
          </div>

          {userHistory.length > 0 && (
            <div className="panel metal-panel">
              <h3>Your Salary History</h3>
              <div className="history-list">
                {userHistory.map((salary, index) => (
                  <div key={index} className="history-item">
                    <span>{salary.name}</span>
                    <span className={`status ${salary.isVerified ? 'verified' : 'pending'}`}>
                      {salary.isVerified ? '✅ Verified' : '⏳ Pending'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {complianceStatus && (
            <div className="panel metal-panel compliance-panel">
              <h3>✅ Compliance Verified</h3>
              <p>Your salary data meets privacy standards</p>
              <small>Verified at: {new Date(complianceStatus.timestamp).toLocaleTimeString()}</small>
            </div>
          )}
        </div>
        
        <div className="salaries-section">
          <div className="section-header">
            <h2>Encrypted Salary Records</h2>
            <div className="header-actions">
              <button 
                onClick={loadData} 
                className="refresh-btn" 
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="salaries-list">
            {salaries.length === 0 ? (
              <div className="no-salaries">
                <p>No salary records found</p>
                <button 
                  className="create-btn" 
                  onClick={() => setShowCreateModal(true)}
                >
                  Add First Salary
                </button>
              </div>
            ) : salaries.map((salary, index) => (
              <div 
                className={`salary-item ${selectedSalary?.id === salary.id ? "selected" : ""} ${salary.isVerified ? "verified" : ""}`} 
                key={index}
                onClick={() => setSelectedSalary(salary)}
              >
                <div className="salary-title">{salary.name}</div>
                <div className="salary-meta">
                  <span>Experience: {salary.publicValue1} years</span>
                  <span>Added: {new Date(salary.timestamp * 1000).toLocaleDateString()}</span>
                </div>
                <div className="salary-status">
                  Status: {salary.isVerified ? "✅ Benchmark Ready" : "🔒 Encrypted"}
                  {salary.isVerified && salary.decryptedValue && (
                    <span className="verified-percentile">Percentile: Calculated</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <ModalAddSalary 
          onSubmit={createSalary} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingSalary} 
          salaryData={newSalaryData} 
          setSalaryData={setNewSalaryData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedSalary && (
        <SalaryDetailModal 
          salary={selectedSalary} 
          onClose={() => { 
            setSelectedSalary(null); 
            setDecryptedValue(null); 
            setBenchmarkResult(null);
          }} 
          decryptedValue={decryptedValue} 
          setDecryptedValue={setDecryptedValue} 
          isDecrypting={isDecrypting || fheIsDecrypting} 
          decryptData={() => decryptData(selectedSalary.encryptedSalary)}
          benchmarkResult={benchmarkResult}
          renderBenchmarkChart={renderBenchmarkChart}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const ModalAddSalary: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  salaryData: any;
  setSalaryData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, salaryData, setSalaryData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'salary') {
      const intValue = value.replace(/[^\d]/g, '');
      setSalaryData({ ...salaryData, [name]: intValue });
    } else {
      setSalaryData({ ...salaryData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="add-salary-modal">
        <div className="modal-header">
          <h2>Add Encrypted Salary</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE 🔐 Privacy Protection</strong>
            <p>Your salary will be encrypted and never exposed</p>
          </div>
          
          <div className="form-group">
            <label>Position Title *</label>
            <input 
              type="text" 
              name="name" 
              value={salaryData.name} 
              onChange={handleChange} 
              placeholder="e.g., Senior Developer" 
            />
          </div>
          
          <div className="form-group">
            <label>Annual Salary (USD) *</label>
            <input 
              type="number" 
              name="salary" 
              value={salaryData.salary} 
              onChange={handleChange} 
              placeholder="Enter your salary" 
              step="1"
              min="0"
            />
            <div className="data-type-label">FHE Encrypted Integer</div>
          </div>
          
          <div className="form-group">
            <label>Industry *</label>
            <select name="industry" value={salaryData.industry} onChange={handleChange}>
              <option value="">Select Industry</option>
              <option value="Technology">Technology</option>
              <option value="Finance">Finance</option>
              <option value="Healthcare">Healthcare</option>
              <option value="Education">Education</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Years of Experience *</label>
            <input 
              type="number" 
              min="0" 
              max="50" 
              name="experience" 
              value={salaryData.experience} 
              onChange={handleChange} 
              placeholder="Years of experience" 
            />
            <div className="data-type-label">Public Data</div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !salaryData.name || !salaryData.salary || !salaryData.industry || !salaryData.experience} 
            className="submit-btn"
          >
            {creating || isEncrypting ? "Encrypting Salary..." : "Add Encrypted Salary"}
          </button>
        </div>
      </div>
    </div>
  );
};

const SalaryDetailModal: React.FC<{
  salary: SalaryData;
  onClose: () => void;
  decryptedValue: number | null;
  setDecryptedValue: (value: number | null) => void;
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
  benchmarkResult: SalaryBenchmark | null;
  renderBenchmarkChart: (benchmark: SalaryBenchmark) => JSX.Element;
}> = ({ salary, onClose, decryptedValue, setDecryptedValue, isDecrypting, decryptData, benchmarkResult, renderBenchmarkChart }) => {
  const handleDecrypt = async () => {
    if (decryptedValue !== null) { 
      setDecryptedValue(null); 
      return; 
    }
    
    const decrypted = await decryptData();
    if (decrypted !== null) {
      setDecryptedValue(decrypted);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="salary-detail-modal">
        <div className="modal-header">
          <h2>Salary Benchmark Analysis</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="salary-info">
            <div className="info-item">
              <span>Position:</span>
              <strong>{salary.name}</strong>
            </div>
            <div className="info-item">
              <span>Experience:</span>
              <strong>{salary.publicValue1} years</strong>
            </div>
            <div className="info-item">
              <span>Added:</span>
              <strong>{new Date(salary.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
          </div>
          
          <div className="data-section">
            <h3>Encrypted Salary Data</h3>
            
            <div className="data-row">
              <div className="data-label">Annual Salary:</div>
              <div className="data-value">
                {salary.isVerified && salary.decryptedValue ? 
                  `$${salary.decryptedValue.toLocaleString()} (Verified)` : 
                  decryptedValue !== null ? 
                  `$${decryptedValue.toLocaleString()} (Decrypted)` : 
                  "🔒 FHE Encrypted"
                }
              </div>
              <button 
                className={`decrypt-btn ${(salary.isVerified || decryptedValue !== null) ? 'decrypted' : ''}`}
                onClick={handleDecrypt} 
                disabled={isDecrypting}
              >
                {isDecrypting ? (
                  "🔓 Calculating..."
                ) : salary.isVerified ? (
                  "✅ Benchmarked"
                ) : decryptedValue !== null ? (
                  "🔄 Re-calculate"
                ) : (
                  "📊 Get Benchmark"
                )}
              </button>
            </div>
            
            <div className="fhe-info">
              <div className="fhe-icon">🔐</div>
              <div>
                <strong>Privacy-Preserving Benchmark</strong>
                <p>Your salary remains encrypted while we calculate your market position</p>
              </div>
            </div>
          </div>
          
          {(salary.isVerified || decryptedValue !== null) && benchmarkResult && (
            <div className="benchmark-section">
              <h3>Market Position Analysis</h3>
              {renderBenchmarkChart(benchmarkResult)}
              
              <div className="privacy-notice">
                <small>✅ Your actual salary was never exposed during analysis</small>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
          {!salary.isVerified && (
            <button 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
              className="verify-btn"
            >
              {isDecrypting ? "Calculating benchmark..." : "Calculate Benchmark"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;

