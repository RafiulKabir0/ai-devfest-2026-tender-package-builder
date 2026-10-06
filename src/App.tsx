import React, { useState, useMemo, useRef } from 'react';
import { 
  FileText, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  FileWarning, 
  Trash2, 
  Download, 
  Languages, 
  Sparkles, 
  ShieldCheck, 
  Layers, 
  FileCheck,
  AlertTriangle,
  FolderOpen
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { 
  TenderInfo, 
  Requirement, 
  RequirementsConfig, 
  UploadedPdfFile, 
  Language,
  RequirementStatus
} from './types';
import { calculateSha256 } from './utils/hash';
import { calculateRequirementStatus, computeAllRequirementStates } from './utils/statusEngine';
import { generatePackagePdf, IncludedDocumentItem } from './utils/pdfGenerator';
import { translations } from './locales/translations';

const MAX_FILES = 30;
const MAX_TOTAL_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export const App: React.FC = () => {
  const [lang, setLang] = useState<Language>('en');
  const t = translations[lang];

  // Tender & Requirements state
  const [tender, setTender] = useState<TenderInfo | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);

  // Uploaded files state
  const [uploadedFiles, setUploadedFiles] = useState<UploadedPdfFile[]>([]);
  
  // Matching state: requirementId -> fileId
  const [matches, setMatches] = useState<Record<string, string | null>>({});

  // Expiry dates state: requirementId -> YYYY-MM-DD
  const [expiryDates, setExpiryDates] = useState<Record<string, string>>({});

  // Toast / notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPdfBlobUrl, setGeneratedPdfBlobUrl] = useState<string | null>(null);
  const [generatedPageCount, setGeneratedPageCount] = useState<number>(0);
  const [generatedFilename, setGeneratedFilename] = useState<string>('');

  const jsonInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 4500);
  };

  // Safe requirements.json parser
  const parseRequirementsJson = (jsonString: string) => {
    try {
      const parsed = JSON.parse(jsonString) as RequirementsConfig;
      if (!parsed || !parsed.tender || !Array.isArray(parsed.requirements)) {
        throw new Error('Invalid requirements.json structure. Missing tender or requirements.');
      }
      if (!parsed.tender.tender_id || !parsed.tender.submission_deadline) {
        throw new Error('Tender info must contain tender_id and submission_deadline.');
      }
      setTender(parsed.tender);
      const sorted = [...parsed.requirements].sort((a, b) => a.order - b.order);
      setRequirements(sorted);
      setMatches({});
      setExpiryDates({});
      setGeneratedPdfBlobUrl(null);
      showToast(`Loaded tender: ${parsed.tender.tender_id} (${sorted.length} requirements)`);
    } catch (err: any) {
      alert(`Error loading requirements.json: ${err.message}`);
    }
  };

  // Handle requirements.json file selection
  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) parseRequirementsJson(content);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Compute duplicate status across all files
  const updateDuplicates = (files: UploadedPdfFile[]): UploadedPdfFile[] => {
    const hashCounts: Record<string, number> = {};
    files.forEach((f) => {
      if (f.sha256) {
        hashCounts[f.sha256] = (hashCounts[f.sha256] || 0) + 1;
      }
    });

    return files.map((f) => ({
      ...f,
      isDuplicate: Boolean(f.sha256 && hashCounts[f.sha256] > 1),
    }));
  };

  // Handle PDF file uploads
  const handlePdfUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    let nonPdfRejected = false;
    const currentTotalFiles = uploadedFiles.length;
    const incomingFiles: File[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (!isPdf) {
        nonPdfRejected = true;
        continue;
      }
      incomingFiles.push(file);
    }

    if (nonPdfRejected) {
      showToast(t.rejectNonPdf);
    }

    if (currentTotalFiles + incomingFiles.length > MAX_FILES) {
      alert(t.exceedMaxFiles);
      return;
    }

    const currentTotalBytes = uploadedFiles.reduce((acc, f) => acc + f.size, 0);
    const newBytes = incomingFiles.reduce((acc, f) => acc + f.size, 0);
    if (currentTotalBytes + newBytes > MAX_TOTAL_SIZE_BYTES) {
      alert(t.exceedMaxSize);
      return;
    }

    const newUploadedFiles: UploadedPdfFile[] = [];

    for (const file of incomingFiles) {
      try {
        const buffer = await file.arrayBuffer();
        const hash = await calculateSha256(buffer);

        let pageCount = 0;
        try {
          const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
          pageCount = doc.getPageCount();
        } catch (pdfErr) {
          console.warn('PDF page count failed for:', file.name, pdfErr);
        }

        const newId = `${file.name}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        newUploadedFiles.push({
          id: newId,
          name: file.name,
          size: file.size,
          pageCount: pageCount || 1,
          sha256: hash,
          isDuplicate: false,
          matchedRequirementId: null,
          arrayBuffer: buffer,
        });
      } catch (err: any) {
        console.error('Error processing file:', file.name, err);
      }
    }

    const merged = updateDuplicates([...uploadedFiles, ...newUploadedFiles]);
    setUploadedFiles(merged);
    showToast(`Added ${newUploadedFiles.length} PDF file(s).`);
  };

  // Remove an uploaded file
  const handleRemoveFile = (fileId: string) => {
    // Unmatch any requirement mapped to this file
    setMatches((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((reqId) => {
        if (next[reqId] === fileId) next[reqId] = null;
      });
      return next;
    });

    const remaining = uploadedFiles.filter((f) => f.id !== fileId);
    setUploadedFiles(updateDuplicates(remaining));
    setGeneratedPdfBlobUrl(null);
  };

  // Match a requirement to a file
  const handleMatch = (requirementId: string, fileId: string | null) => {
    if (!fileId) {
      // Unmatch
      setMatches((prev) => ({ ...prev, [requirementId]: null }));
      setGeneratedPdfBlobUrl(null);
      return;
    }

    // Check if this file is a duplicate of an already matched file
    const targetFile = uploadedFiles.find((f) => f.id === fileId);
    if (targetFile?.isDuplicate) {
      // Check if another copy of this same duplicate hash is already matched to another requirement
      const duplicateAlreadyAssignedToOther = Object.entries(matches).find(([otherReqId, assignedFileId]) => {
        if (!assignedFileId || otherReqId === requirementId) return false;
        const otherFile = uploadedFiles.find((f) => f.id === assignedFileId);
        return otherFile?.sha256 === targetFile.sha256;
      });

      if (duplicateAlreadyAssignedToOther) {
        alert('Cannot match: An identical duplicate of this PDF is already assigned to another requirement.');
        return;
      }
    }

    // Ensure one-to-one mapping: remove file from any other requirement
    setMatches((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (next[k] === fileId) next[k] = null;
      });
      next[requirementId] = fileId;
      return next;
    });
    setGeneratedPdfBlobUrl(null);
  };

  // Smart auto-match suggestion based on document title / filename keywords
  const handleAutoMatch = () => {
    if (requirements.length === 0 || uploadedFiles.length === 0) return;

    const newMatches = { ...matches };
    let matchCount = 0;

    requirements.forEach((req) => {
      if (newMatches[req.id]) return; // already matched

      // Try to find unmatched, non-duplicate (or first valid duplicate) file
      const candidate = uploadedFiles.find((f) => {
        // Must not be matched yet
        if (Object.values(newMatches).includes(f.id)) return false;

        const fname = f.name.toLowerCase();
        // Priority rules for sample pack & standard tenders
        if (req.id.toUpperCase() === 'R01') {
          return fname.includes('trade_license_2026') || fname.includes('trade_license');
        }
        if (req.id.toUpperCase() === 'R02') return fname.includes('tin');
        if (req.id.toUpperCase() === 'R03') return fname.includes('vat');
        if (req.id.toUpperCase() === 'R04') return fname.includes('solvency');
        if (req.id.toUpperCase() === 'R05') {
          return fname.includes('experience') && !fname.includes('(1)');
        }
        if (req.id.toUpperCase() === 'R06') return fname.includes('audited');
        if (req.id.toUpperCase() === 'R07') return fname.includes('manufacturer') || fname.includes('authorization');
        if (req.id.toUpperCase() === 'R08') return fname.includes('technical');
        if (req.id.toUpperCase() === 'R09') return fname.includes('financial');
        if (req.id.toUpperCase() === 'R10') return fname.includes('declaration') || fname.includes('scan_0042');

        // Generic matching
        const words = req.title_en.toLowerCase().split(' ').filter((w) => w.length > 3);
        return words.some((w) => fname.includes(w));
      });

      if (candidate) {
        newMatches[req.id] = candidate.id;
        matchCount++;
      }
    });

    setMatches(newMatches);
    showToast(`Auto-matched ${matchCount} document(s).`);
  };

  // Set expiry date for a requirement
  const handleExpiryChange = (requirementId: string, date: string) => {
    setExpiryDates((prev) => ({ ...prev, [requirementId]: date }));
    setGeneratedPdfBlobUrl(null);
  };

  // Recalculate requirement states whenever matches, expiry, or tender deadline changes
  const requirementStates = useMemo(() => {
    if (!tender) return [];
    return computeAllRequirementStates(requirements, matches, expiryDates, tender.submission_deadline);
  }, [requirements, matches, expiryDates, tender]);

  // Overall blocking validation
  const blockingIssues = useMemo(() => {
    return requirementStates.filter((s) => s.isBlocking);
  }, [requirementStates]);

  const canGenerate = useMemo(() => {
    return tender !== null && requirements.length > 0 && blockingIssues.length === 0;
  }, [tender, requirements, blockingIssues]);

  // Status counts for overview
  const statusCounts = useMemo(() => {
    const counts: Record<RequirementStatus, number> = {
      OK: 0,
      Missing: 0,
      'Expiry date needed': 0,
      Expired: 0,
      'Not provided': 0,
    };
    requirementStates.forEach((s) => {
      counts[s.status] = (counts[s.status] || 0) + 1;
    });
    return counts;
  }, [requirementStates]);

  // Generate Package PDF
  const handleGeneratePackage = async () => {
    if (!canGenerate || !tender) return;

    try {
      setIsGenerating(true);

      // Build ordered items list
      const includedItems: IncludedDocumentItem[] = [];
      requirementStates.forEach((state) => {
        if (!state.matchedFileId) return; // skip optional not provided
        const file = uploadedFiles.find((f) => f.id === state.matchedFileId);
        if (file) {
          includedItems.push({
            requirement: state.requirement,
            file,
            expiryDate: state.expiryDate,
          });
        }
      });

      const pdfBytes = await generatePackagePdf(tender, includedItems);
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);

      // Count pages in generated PDF
      const generatedDoc = await PDFDocument.load(pdfBytes);
      const totalPages = generatedDoc.getPageCount();

      const filename = `${tender.tender_id}_Package.pdf`;
      setGeneratedPdfBlobUrl(blobUrl);
      setGeneratedPageCount(totalPages);
      setGeneratedFilename(filename);

      showToast(`Generated ${filename} (${totalPages} pages total)!`);
    } catch (err: any) {
      console.error('Error generating PDF:', err);
      alert(`Package generation failed: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Download PDF
  const handleDownload = () => {
    if (!generatedPdfBlobUrl || !generatedFilename) return;
    const link = document.createElement('a');
    link.href = generatedPdfBlobUrl;
    link.download = generatedFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Quick load sample-pack button for testing / evaluation
  const handleLoadSamplePack = async () => {
    try {
      const response = await fetch('/sample-pack/requirements.json');
      if (!response.ok) {
        throw new Error('Could not automatically fetch sample-pack/requirements.json');
      }
      const text = await response.text();
      parseRequirementsJson(text);
    } catch {
      // Trigger file picker
      jsonInputRef.current?.click();
    }
  };

  // Render Status Badge
  const renderStatusBadge = (status: RequirementStatus) => {
    switch (status) {
      case 'OK':
        return (
          <span className="status-badge ok">
            <CheckCircle2 size={13} />
            {t.status['OK']}
          </span>
        );
      case 'Missing':
        return (
          <span className="status-badge missing">
            <AlertCircle size={13} />
            {t.status['Missing']}
          </span>
        );
      case 'Expiry date needed':
        return (
          <span className="status-badge expiry-needed">
            <Clock size={13} />
            {t.status['Expiry date needed']}
          </span>
        );
      case 'Expired':
        return (
          <span className="status-badge expired">
            <AlertTriangle size={13} />
            {t.status['Expired']}
          </span>
        );
      case 'Not provided':
        return (
          <span className="status-badge not-provided">
            <FileWarning size={13} />
            {t.status['Not provided']}
          </span>
        );
    }
  };

  return (
    <div className={`app-container ${lang === 'bn' ? 'lang-bn' : ''}`}>
      {/* Top Header */}
      <header className="app-header">
        <div className="header-brand">
          <div className="header-logo">
            <FileText size={26} />
          </div>
          <div className="header-titles">
            <h1>{t.appTitle}</h1>
            <p>{t.appSubtitle}</p>
          </div>
        </div>

        <button 
          className="lang-btn" 
          onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
          title="Toggle Language"
        >
          <Languages size={16} />
          <span>{t.switchLanguage}</span>
        </button>
      </header>

      {/* 1. Tender Section */}
      <section className="card-section">
        <div className="section-header">
          <div>
            <h2 className="section-title">
              <Layers size={18} />
              {t.tenderInfoTitle}
            </h2>
            <p className="section-desc">
              {tender ? `${tender.tender_id} — ${tender.title}` : t.noTenderLoaded}
            </p>
          </div>

          <div>
            <input 
              type="file" 
              ref={jsonInputRef} 
              accept=".json,application/json" 
              style={{ display: 'none' }} 
              onChange={handleJsonUpload} 
            />
            <button 
              className="btn-primary" 
              onClick={() => jsonInputRef.current?.click()}
              style={{ padding: '8px 16px', fontSize: '13px' }}
            >
              <FolderOpen size={16} />
              {tender ? t.replaceRequirementsBtn : t.loadRequirementsBtn}
            </button>
          </div>
        </div>

        {tender ? (
          <div className="tender-grid">
            <div className="tender-data-card">
              <div className="tender-label">{t.tenderId}</div>
              <div className="tender-val">{tender.tender_id}</div>
            </div>
            <div className="tender-data-card">
              <div className="tender-label">{t.tenderTitle}</div>
              <div className="tender-val">{tender.title}</div>
            </div>
            <div className="tender-data-card">
              <div className="tender-label">{t.procuringEntity}</div>
              <div className="tender-val">{tender.procuring_entity}</div>
            </div>
            <div className="tender-data-card">
              <div className="tender-label">{t.bidderName}</div>
              <div className="tender-val">{tender.bidder}</div>
            </div>
            <div className="tender-data-card">
              <div className="tender-label">{t.submissionDeadline}</div>
              <div className="tender-val" style={{ color: '#1d4ed8' }}>{tender.submission_deadline}</div>
            </div>
          </div>
        ) : (
          <div 
            className="dropzone"
            onClick={() => jsonInputRef.current?.click()}
          >
            <FolderOpen size={36} className="dropzone-icon" />
            <div className="dropzone-text">{t.dragOrClickJson}</div>
            <div className="dropzone-sub">Accepts standard requirements.json schema</div>
          </div>
        )}
      </section>

      {/* 2. PDF Upload Section */}
      <section className="card-section">
        <div className="section-header">
          <div>
            <h2 className="section-title">
              <Upload size={18} />
              {t.uploadSectionTitle}
            </h2>
            <p className="section-desc">{t.uploadLimits}</p>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            {uploadedFiles.length > 0 && requirements.length > 0 && (
              <button 
                className="lang-btn"
                onClick={handleAutoMatch}
                title="Automatically match files based on filenames"
              >
                <Sparkles size={14} color="#2563eb" />
                <span>Auto-Match</span>
              </button>
            )}
            <input 
              type="file" 
              ref={pdfInputRef} 
              multiple 
              accept=".pdf,application/pdf" 
              style={{ display: 'none' }} 
              onChange={(e) => handlePdfUpload(e.target.files)} 
            />
            <button 
              className="btn-primary" 
              onClick={() => pdfInputRef.current?.click()}
              style={{ padding: '8px 16px', fontSize: '13px' }}
            >
              <Upload size={16} />
              {t.uploadBtn}
            </button>
          </div>
        </div>

        {/* Dropzone */}
        <div 
          className="dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handlePdfUpload(e.dataTransfer.files);
          }}
          onClick={() => pdfInputRef.current?.click()}
        >
          <Upload size={32} className="dropzone-icon" />
          <div className="dropzone-text">{t.dropPdfsHere}</div>
          <div className="dropzone-sub">
            {uploadedFiles.length} / {MAX_FILES} files • {(uploadedFiles.reduce((a, b) => a + b.size, 0) / (1024 * 1024)).toFixed(2)} MB / 50 MB
          </div>
        </div>

        {/* Uploaded File Cards */}
        {uploadedFiles.length > 0 && (
          <div className="files-list">
            {uploadedFiles.map((file) => {
              const matchedReq = requirements.find((r) => matches[r.id] === file.id);
              return (
                <div key={file.id} className={`file-item-card ${file.isDuplicate ? 'is-dup' : ''}`}>
                  <div className="file-info-col">
                    <FileText size={20} color={file.isDuplicate ? '#dc2626' : '#2563eb'} />
                    <div className="file-details">
                      <div className="file-name" title={file.name}>{file.name}</div>
                      <div className="file-meta">
                        <span>{file.pageCount} page(s)</span>
                        <span>•</span>
                        <span>{(file.size / 1024).toFixed(1)} KB</span>
                        {file.isDuplicate && (
                          <>
                            <span>•</span>
                            <span className="badge badge-dup">{t.duplicateBadge}</span>
                          </>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                        {matchedReq ? (
                          <span style={{ color: '#16a34a', fontWeight: 600 }}>
                            {t.assignedTo}: {lang === 'bn' ? matchedReq.title_bn : matchedReq.title_en} ({matchedReq.id})
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>{t.unassigned}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button 
                    className="btn-remove" 
                    onClick={() => handleRemoveFile(file.id)}
                    title={t.removeFile}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. Requirements & Matching Section */}
      {requirements.length > 0 && (
        <section className="card-section">
          <div className="section-header">
            <div>
              <h2 className="section-title">
                <FileCheck size={18} />
                {t.requirementsTitle}
              </h2>
              <p className="section-desc">{t.requirementsSubtitle}</p>
            </div>
          </div>

          {/* Status summary counters */}
          <div className="status-summary-bar">
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>{t.statusSummary}:</span>
            <div className="summary-pill">
              <CheckCircle2 size={14} color="#059669" />
              <span>OK: {statusCounts.OK}</span>
            </div>
            {statusCounts.Missing > 0 && (
              <div className="summary-pill" style={{ borderColor: '#fca5a5', background: '#fef2f2' }}>
                <AlertCircle size={14} color="#dc2626" />
                <span style={{ color: '#991b1b' }}>Missing: {statusCounts.Missing}</span>
              </div>
            )}
            {statusCounts['Expiry date needed'] > 0 && (
              <div className="summary-pill" style={{ borderColor: '#fde68a', background: '#fffbeb' }}>
                <Clock size={14} color="#d97706" />
                <span style={{ color: '#92400e' }}>Expiry Needed: {statusCounts['Expiry date needed']}</span>
              </div>
            )}
            {statusCounts.Expired > 0 && (
              <div className="summary-pill" style={{ borderColor: '#fecdd3', background: '#fff1f2' }}>
                <AlertTriangle size={14} color="#be123c" />
                <span style={{ color: '#be123c' }}>Expired: {statusCounts.Expired}</span>
              </div>
            )}
            {statusCounts['Not provided'] > 0 && (
              <div className="summary-pill">
                <FileWarning size={14} color="#64748b" />
                <span>Not Provided: {statusCounts['Not provided']}</span>
              </div>
            )}
          </div>

          {/* Requirements Table */}
          <div className="req-table-wrapper">
            <table className="req-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>{t.colOrder}</th>
                  <th>{t.colTitle}</th>
                  <th>{t.colMandatory}</th>
                  <th>{t.colMatch}</th>
                  <th>{t.colExpiry}</th>
                  <th>{t.colStatus}</th>
                  <th>{t.colActions}</th>
                </tr>
              </thead>
              <tbody>
                {requirementStates.map((state) => {
                  const req = state.requirement;
                  const reqTitle = lang === 'bn' ? req.title_bn : req.title_en;
                  const matchedFile = uploadedFiles.find((f) => f.id === state.matchedFileId);

                  return (
                    <tr key={req.id}>
                      <td style={{ fontWeight: 600, color: '#64748b' }}>{req.order}</td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{reqTitle}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                          ID: {req.id} • {req.has_expiry ? 'Requires Expiry' : 'No Expiry Needed'}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${req.mandatory ? 'badge-mandatory' : 'badge-optional'}`}>
                          {req.mandatory ? t.mandatoryBadge : t.optionalBadge}
                        </span>
                      </td>
                      <td>
                        <select
                          className={`select-input ${state.matchedFileId ? 'assigned' : ''}`}
                          value={state.matchedFileId || ''}
                          onChange={(e) => handleMatch(req.id, e.target.value || null)}
                        >
                          <option value="">{t.selectFilePlaceholder}</option>
                          {uploadedFiles.map((file) => {
                            const isAssignedElsewhere = Object.entries(matches).some(
                              ([rId, fId]) => rId !== req.id && fId === file.id
                            );
                            return (
                              <option 
                                key={file.id} 
                                value={file.id} 
                                disabled={isAssignedElsewhere}
                              >
                                {file.name} ({file.pageCount}p) {isAssignedElsewhere ? '(Assigned)' : ''} {file.isDuplicate ? '[Duplicate]' : ''}
                              </option>
                            );
                          })}
                        </select>
                      </td>
                      <td>
                        {req.has_expiry ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <input
                              type="date"
                              className="date-input"
                              value={state.expiryDate}
                              disabled={!state.matchedFileId}
                              onChange={(e) => handleExpiryChange(req.id, e.target.value)}
                            />
                            {tender && state.expiryDate && (
                              <span style={{ fontSize: '10.5px', color: state.expiryDate < tender.submission_deadline ? '#dc2626' : '#16a34a' }}>
                                {state.expiryDate < tender.submission_deadline ? 'Before deadline' : 'Valid'}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: '12px', color: '#94a3b8' }}>—</span>
                        )}
                      </td>
                      <td>
                        <div>
                          {renderStatusBadge(state.status)}
                          {state.isBlocking && (
                            <div style={{ fontSize: '11px', color: '#991b1b', marginTop: '4px', maxWidth: '240px' }}>
                              {state.statusReason}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        {state.matchedFileId && (
                          <button
                            className="btn-remove"
                            style={{ color: '#475569', fontSize: '12px' }}
                            onClick={() => handleMatch(req.id, null)}
                            title={t.unmatchBtn}
                          >
                            {t.unmatchBtn}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 4. Generate & Download Package Section */}
      <section className="card-section">
        <div className="section-header">
          <div>
            <h2 className="section-title">
              <ShieldCheck size={18} />
              {t.packageSectionTitle}
            </h2>
            <p className="section-desc">{t.coverPageNote}</p>
          </div>
        </div>

        {/* Blocking Issues Alert Box */}
        {blockingIssues.length > 0 && (
          <div className="blocking-box">
            <div className="blocking-box-title">
              <AlertCircle size={18} />
              <span>{t.blockingIssuesTitle} ({blockingIssues.length})</span>
            </div>
            <ul className="blocking-list">
              {blockingIssues.map((issue) => (
                <li key={issue.requirement.id}>
                  <strong>{lang === 'bn' ? issue.requirement.title_bn : issue.requirement.title_en} ({issue.requirement.id}):</strong>
                  <span>{issue.statusReason}</span>
                </li>
              ))}
            </ul>
            <div style={{ marginTop: '10px', fontSize: '12.5px', color: '#991b1b', fontWeight: 600 }}>
              {t.resolveIssuesMsg}
            </div>
          </div>
        )}

        {/* Generate Button Area */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <button
            className="btn-primary"
            disabled={!canGenerate || isGenerating}
            onClick={handleGeneratePackage}
          >
            <FileText size={18} />
            <span>{isGenerating ? t.generating : t.generateBtn}</span>
          </button>

          {canGenerate && !generatedPdfBlobUrl && (
            <span style={{ fontSize: '13px', color: '#059669', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={16} />
              {t.readyToGenerate}
            </span>
          )}
        </div>

        {/* Success & Download Box */}
        {generatedPdfBlobUrl && (
          <div className="success-box">
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#065f46', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={20} color="#059669" />
                <span>{t.packageGeneratedSuccess}</span>
              </div>
              <div style={{ fontSize: '13px', color: '#047857', marginTop: '4px' }}>
                {generatedFilename} • {generatedPageCount} total pages (including English Cover Page)
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn-success" onClick={handleDownload}>
                <Download size={18} />
                <span>{t.downloadBtn}</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Toast Alert */}
      {toastMessage && (
        <div className="alert-toast">
          <Sparkles size={16} color="#60a5fa" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
export default App;
