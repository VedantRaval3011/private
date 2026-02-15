// Batch List Modal Component
export function BatchListModal({ 
    batchList, 
    selectedProductCode, 
    selectedProductName,
    isBatchListLoading,
    batchListError,
    onClose 
}: {
    batchList: any[] | null;
    selectedProductCode: string | null;
    selectedProductName: string | null;
    isBatchListLoading: boolean;
    batchListError: string | null;
    onClose: () => void;
}) {
    if (!batchList || !selectedProductCode) return null;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.6)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: '20px',
            }}
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: 'white',
                    borderRadius: '16px',
                    boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)',
                    width: '100%',
                    maxWidth: '1400px',
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '24px 28px',
                    borderBottom: '1px solid #e2e8f0',
                    background: 'linear-gradient(to right, #fee2e2, #fef2f2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontSize: '24px',
                        }}>
                            ⚠️
                        </div>
                        <div>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                                {selectedProductName}
                            </h2>
                            <p style={{ fontSize: '0.9rem', color: '#64748b', margin: '4px 0 0 0' }}>
                                Batches for item code: <strong style={{ color: '#dc2626', fontFamily: 'monospace' }}>{selectedProductCode}</strong>
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '10px',
                            border: 'none',
                            background: '#f1f5f9',
                            color: '#64748b',
                            fontSize: '20px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Stats Bar */}
                <div style={{
                    padding: '16px 28px',
                    background: '#f8fafc',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    gap: '24px',
                }}>
                    <div style={{
                        padding: '12px 20px',
                        background: 'linear-gradient(135deg, #fef2f2, #fee2e2)',
                        borderRadius: '12px',
                        border: '1px solid #fecaca',
                    }}>
                        <p style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 600, marginBottom: '4px' }}>Total Batches</p>
                        <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#b91c1c', margin: 0 }}>
                            {batchList.length}
                        </p>
                    </div>
                </div>

                {/* Batch List Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
                    {isBatchListLoading ? (
                        <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
                            <div style={{ width: '48px', height: '48px', border: '4px solid #e2e8f0', borderTopColor: '#dc2626', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 20px' }} />
                            Loading batch details...
                        </div>
                    ) : batchListError ? (
                        <div style={{ textAlign: 'center', padding: '60px', color: '#ef4444' }}>
                            ❌ {batchListError}
                        </div>
                    ) : batchList.length > 0 ? (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#fee2e2' }}>
                                        <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 600, borderBottom: '2px solid #fecaca', color: '#7f1d1d' }}>Batch No</th>
                                        <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 600, borderBottom: '2px solid #fecaca', color: '#7f1d1d' }}>Item Name</th>
                                        <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 600, borderBottom: '2px solid #fecaca', color: '#7f1d1d' }}>Mfg Date</th>
                                        <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 600, borderBottom: '2px solid #fecaca', color: '#7f1d1d' }}>Expiry Date</th>
                                        <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 600, borderBottom: '2px solid #fecaca', color: '#7f1d1d' }}>Batch Size</th>
                                        <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 600, borderBottom: '2px solid #fecaca', color: '#7f1d1d' }}>Department</th>
                                        <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 600, borderBottom: '2px solid #fecaca', color: '#7f1d1d' }}>Type</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {batchList.map((batch: any, idx: number) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? 'white' : '#fef2f2' }}>
                                            <td style={{ padding: '10px', fontWeight: 600, color: '#dc2626', fontFamily: 'monospace' }}>
                                                {batch.batchNumber}
                                            </td>
                                            <td style={{ padding: '10px', color: '#374151' }}>
                                                {batch.itemName || 'N/A'}
                                            </td>
                                            <td style={{ padding: '10px', color: '#64748b', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                                {batch.mfgDate || 'N/A'}
                                            </td>
                                            <td style={{ padding: '10px', color: '#64748b', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                                {batch.expiryDate || 'N/A'}
                                            </td>
                                            <td style={{ padding: '10px', color: '#059669', fontWeight: 600 }}>
                                                {batch.batchSize ? `${batch.batchSize} ${batch.unit || ''}` : 'N/A'}
                                            </td>
                                            <td style={{ padding: '10px', color: '#7c3aed', fontSize: '0.8rem' }}>
                                                {batch.department || 'N/A'}
                                            </td>
                                            <td style={{ padding: '10px', color: '#64748b', fontSize: '0.8rem' }}>
                                                {batch.type || 'N/A'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📦</div>
                            <h3 style={{ fontSize: '1.2rem', color: '#475569', marginBottom: '8px' }}>No batches found</h3>
                            <p>No batch records found for this item code.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
