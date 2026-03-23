import re

with open('c:/Dev/private/src/app/formula-data/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add state variables
state_vars = """    const [showAstRstAnalysis, setShowAstRstAnalysis] = useState(false);
    const [astRstAnalysisTab, setAstRstAnalysisTab] = useState<'missing' | 'orphaned' | 'found'>('missing');"""
new_state_vars = state_vars + """
    const [showStabilityAnalysis, setShowStabilityAnalysis] = useState(false);
    const [stabilityAnalysisTab, setStabilityAnalysisTab] = useState<'missing' | 'orphaned' | 'found'>('missing');"""
content = content.replace(state_vars, new_state_vars)

# 2. Add Button
button_str = """                            {/* AST & RST Analysis Button */}"""

new_btn = """                            {/* ONLY STABILITY Analysis Button */}
                            <button
                                onClick={() => setShowStabilityAnalysis(true)}
                                style={{
                                    padding: '0.75rem 1rem',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid #10b981',
                                    background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                                    color: '#047857',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    fontWeight: '600',
                                    fontSize: '0.9rem',
                                    transition: 'all 0.2s ease',
                                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)',
                                    position: 'relative' as const,
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'scale(1.02)';
                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.35)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'scale(1)';
                                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.25)';
                                }}
                            >
                                <span style={{ fontSize: '1.1rem' }}>🌡️</span>
                                ONLY STABILITY Analysis
                                {(() => {
                                    const missing = formulas.filter(f => {
                                        const key = toMfrKey(f.masterFormulaDetails.masterCardNo);
                                        const sInfo = stabilityData.byMfrKey[key];
                                        const hasAcc = sInfo?.hasAccelerated ?? false;
                                        const hasLT = sInfo?.hasLongTerm ?? false;
                                        return !hasAcc || !hasLT;
                                    }).length;
                                    return missing > 0 ? (
                                        <span style={{
                                            position: 'absolute',
                                            top: '-6px',
                                            right: '-6px',
                                            background: '#ef4444',
                                            color: 'white',
                                            borderRadius: '50%',
                                            width: '18px',
                                            height: '18px',
                                            fontSize: '0.6rem',
                                            fontWeight: '800',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}>{missing}</span>
                                    ) : null;
                                })()}
                            </button>

"""
content = content.replace(button_str, new_btn + button_str)

# 3. Add Modal
# Extract the AST modal
match = re.search(r'(            \{\/\* AST & RST Analysis Modal \*\/\}.*?^            \}\)\(\)\})', content, re.MULTILINE | re.DOTALL)
if match:
    ast_modal = match.group(1)
    
    # Modify the modal for Stability
    st_modal = ast_modal.replace('AST & RST Analysis', 'ONLY STABILITY Analysis')
    st_modal = st_modal.replace('AST_RST_Analysis', 'ONLY_STABILITY_Analysis')
    st_modal = st_modal.replace('showAstRstAnalysis', 'showStabilityAnalysis')
    st_modal = st_modal.replace('setShowAstRstAnalysis', 'setShowStabilityAnalysis')
    st_modal = st_modal.replace('astRstAnalysisTab', 'stabilityAnalysisTab')
    st_modal = st_modal.replace('setAstRstAnalysisTab', 'setStabilityAnalysisTab')
    st_modal = st_modal.replace('AST & RST', 'ONLY STABILITY')
    st_modal = st_modal.replace('AST/RST', 'ONLY STABILITY')
    st_modal = st_modal.replace('astRstData', 'stabilityData')
    st_modal = st_modal.replace('AST/RST/Stability', 'Stability')
    
    # Custom tweaks in the modal
    
    # 1. getStatus function tweak
    # from:
    # const aInfo = stabilityData.byMfrKey[key];
    # const sInfo = stabilityData.byMfrKey[key];
    # return {
    #     linked: aInfo !== undefined || sInfo !== undefined,
    #     hasAcc: (aInfo?.hasAccelerated || sInfo?.hasAccelerated) ?? false,
    #     hasLT: (aInfo?.hasLongTerm || sInfo?.hasLongTerm) ?? false,
    # };
    st_modal = re.sub(
        r'const aInfo = [^;]+;\s*const sInfo = stabilityData\.byMfrKey\[key\];\s*return \{\s*linked: aInfo !== undefined \|\| sInfo !== undefined,\s*hasAcc: \(aInfo\?\.hasAccelerated \|\| sInfo\?\.hasAccelerated\) \?\? false,\s*hasLT: \(aInfo\?\.hasLongTerm \|\| sInfo\?\.hasLongTerm\) \?\? false,\s*\};',
        'const sInfo = stabilityData.byMfrKey[key];\\n                    return {\\n                        linked: sInfo !== undefined,\\n                        hasAcc: sInfo?.hasAccelerated ?? false,\\n                        hasLT: sInfo?.hasLongTerm ?? false,\\n                    };',
        st_modal
    )

    # 2. orphanedDocs loop tweak
    # from:
    # const allDocKeys = new Set([
    #     ...Object.keys(stabilityData.byMfrKey),
    #     ...Object.keys(stabilityData.byMfrKey),
    # ]);
    st_modal = re.sub(
        r'const allDocKeys = new Set\(\[\s*\.\.\.Object\.keys\(stabilityData\.byMfrKey\),\s*\.\.\.Object\.keys\(stabilityData\.byMfrKey\),\s*\]\);',
        'const allDocKeys = new Set([...Object.keys(stabilityData.byMfrKey)]);',
        st_modal
    )

    # from:
    # const aInfo = stabilityData.byMfrKey[key];
    #                     const sInfo = stabilityData.byMfrKey[key];
    #                     orphanedDocs.push({
    #                         mfrNo: key,
    #                         productCodes: [],
    #                         hasAcc: (aInfo?.hasAccelerated || sInfo?.hasAccelerated) ?? false,
    #                         hasLT: (aInfo?.hasLongTerm || sInfo?.hasLongTerm) ?? false,
    #                     });
    st_modal = re.sub(
        r'const aInfo = [^;]+;\s*const sInfo = stabilityData\.byMfrKey\[key\];\s*orphanedDocs\.push\(\{\s*mfrNo: key,\s*productCodes: \[\],\s*hasAcc: \(aInfo\?\.hasAccelerated \|\| sInfo\?\.hasAccelerated\) \?\? false,\s*hasLT: \(aInfo\?\.hasLongTerm \|\| sInfo\?\.hasLongTerm\) \?\? false,\s*\}\);',
        'const sInfo = stabilityData.byMfrKey[key];\\n                        orphanedDocs.push({\\n                            mfrNo: key,\\n                            productCodes: [],\\n                            hasAcc: sInfo?.hasAccelerated ?? false,\\n                            hasLT: sInfo?.hasLongTerm ?? false,\\n                        });',
        st_modal
    )

    # 3. Summary text tweak
    # from:
    # `MFR keys in ONLY STABILITY docs: ${Object.keys(stabilityData.byMfrKey).length} · Stability docs: ${Object.keys(stabilityData.byMfrKey).length}`
    st_modal = re.sub(
        r'`MFR keys in ONLY STABILITY docs: \$\{Object.keys\(stabilityData\.byMfrKey\)\.length\} · Stability docs: \$\{Object.keys\(stabilityData\.byMfrKey\)\.length\}`',
        '`MFR keys in ONLY STABILITY docs: ${Object.keys(stabilityData.byMfrKey).length}`',
        st_modal
    )

    # 4. Footer tweak
    # from:
    # {Object.keys(stabilityData.byMfrKey).length} ONLY STABILITY · {Object.keys(stabilityData.byMfrKey).length} Stability ·
    st_modal = re.sub(
        r'\{Object\.keys\(stabilityData\.byMfrKey\)\.length\} ONLY STABILITY · \{Object\.keys\(stabilityData\.byMfrKey\)\.length\} Stability ·',
        '{Object.keys(stabilityData.byMfrKey).length} ONLY STABILITY ·',
        st_modal
    )

    # Replace colors to green for Stability
    st_modal = st_modal.replace('#b45309', '#047857')
    st_modal = st_modal.replace('#f59e0b', '#10b981')
    st_modal = st_modal.replace('🔬', '🌡️')
    
    # Add new modal after the old one
    content = content.replace(ast_modal, ast_modal + '\\n\\n' + st_modal)

with open('c:/Dev/private/src/app/formula-data/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("done")
