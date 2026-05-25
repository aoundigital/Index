import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Lock, CheckCircle2, AlertTriangle, HelpCircle, 
  Layers, LogOut, Settings, PlusCircle, RefreshCw, 
  Search, Download, Trash2, Ban, ShieldAlert, Clipboard,
  Terminal, Globe, ExternalLink, Activity, Info, StopCircle
} from 'lucide-react';
import LoginModal from './components/LoginModal';
import GscSettings from './components/GscSettings';
import BatchForm from './components/BatchForm';
import StatsCards from './components/StatsCards';
import { BatchCheckJob, UrlCheckResult, IndexingStatus } from './types';

// Resilient helper to handle temporary server restarting states
async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries = 5,
  delay = 1000
): Promise<Response> {
  try {
    const response = await fetch(url, options);
    return response;
  } catch (err) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retries - 1, delay * 1.2);
    }
    throw err;
  }
}

export default function App() {
  // Auth state
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{ username: string; name: string } | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  // App & config states
  const [isSimulated, setIsSimulated] = useState(true);
  const [siteUrl, setSiteUrl] = useState('');
  const [propertyStrategy, setPropertyStrategy] = useState('domain');
  const [clientEmail, setClientEmail] = useState('');
  
  // Modals / forms states
  const [showSettings, setShowSettings] = useState(false);
  const [showNewBatchForm, setShowNewBatchForm] = useState(true);
  
  // Data lists states
  const [batches, setBatches] = useState<BatchCheckJob[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [loadingBatches, setLoadingBatches] = useState(false);
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Interactive Live logs list
  const [systemLogs, setSystemLogs] = useState<string[]>([]);
  const [showSystemLogs, setShowSystemLogs] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Helpers to append to live simulated UI logs
  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    setSystemLogs(prev => [...prev.slice(-30), `[${timestamp}] ${msg}`]);
  };

  // Load auth session on mount
  useEffect(() => {
    try {
      const savedToken = localStorage.getItem('gsc_session_token');
      const savedUserStr = localStorage.getItem('gsc_session_user');
      
      if (savedToken && savedUserStr) {
        setToken(savedToken);
        setCurrentUser(JSON.parse(savedUserStr));
      }
    } catch (e) {
      console.error("Erro ao carregar sessão anterior:", e);
    } finally {
      setAuthChecking(false);
    }
  }, []);

  // Sync / fetch active operational GSC config metadata
  const fetchGscConfig = async () => {
    try {
      const response = await fetchWithRetry('/api/config', {}, 5, 1000);
      const data = await response.json();
      if (data.success) {
        setIsSimulated(data.mode === 'simulated');
        setSiteUrl(data.siteUrl || '');
        setPropertyStrategy(data.propertyStrategy || 'domain');
        setClientEmail(data.clientEmail || '');
        addLog(`Modo operacional sincronizado: ${data.mode === 'simulated' ? 'SANDBOX / SIMULADOR' : 'PRODUÇÃO / API REAL'}`);
        if (data.mode === 'production' && data.siteUrl) {
          addLog(`Propriedade vinculada: ${data.siteUrl}`);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar metadados de credenciais:', err);
    }
  };

  // Run initial configuration sync when user is ready
  useEffect(() => {
    if (token) {
      fetchGscConfig();
      fetchBatches(true);
      
      // Seed welcome corporate logs
      setSystemLogs([
        `[${new Date().toLocaleTimeString('pt-BR')}] Painel de Verificação GSC Inicializado.`,
        `[${new Date().toLocaleTimeString('pt-BR')}] Protocolo de segurança TLS V1.3 ativado.`,
        `[${new Date().toLocaleTimeString('pt-BR')}] Carregado repositório local de auditorias.`
      ]);
    }
  }, [token]);

  // Handle active batch polling loops
  useEffect(() => {
    if (!token) return;

    // Check if any batch needs live updates (status is idle or processing)
    const hasRunningBatch = batches.some(b => b.status === 'processing');
    
    // We poll even when idle but less frequently, and more frequently if active
    const intervalMs = hasRunningBatch ? 1800 : 8000;
    
    const interval = setInterval(() => {
      fetchBatches(false);
    }, intervalMs);

    return () => clearInterval(interval);
  }, [token, batches]);

  // Auto-scroll logs panel when updated
  useEffect(() => {
    if (showSystemLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [systemLogs, showSystemLogs]);

  // Fetch batches database
  const fetchBatches = async (setLoader = false) => {
    if (setLoader) setLoadingBatches(true);
    try {
      const response = await fetchWithRetry('/api/batches', {}, 5, 1000);
      const data = await response.json();
      if (data.success) {
        const list: BatchCheckJob[] = data.batches;
        setBatches(list);
        
        // Auto-select the first batch if nothing or stale is selected
        if (list.length > 0) {
          if (!selectedBatchId || !list.some(b => b.id === selectedBatchId)) {
            setSelectedBatchId(list[0].id);
          }
        }

        // Live logs notification side effects (only if state changes)
        const activeProcessing = list.filter(b => b.status === 'processing');
        if (activeProcessing.length > 0) {
          activeProcessing.forEach(b => {
            addLog(`Progresso Lote "${b.name}": ${b.checkedUrls}/${b.totalUrls} URLs verificadas`);
          });
        }
      }
    } catch (err) {
      console.error("Erro de rede ao obter lotes:", err);
    } finally {
      if (setLoader) setLoadingBatches(false);
    }
  };

  // Submit batch creation success callback handler
  const handleBatchFormSubmit = (newBatchId: string) => {
    addLog(`Lote de monitoramento registrado sob ID ${newBatchId}`);
    setSelectedBatchId(newBatchId);
    fetchBatches(false);
  };

  // Get active selected batch entity
  const activeBatch = useMemo(() => {
    return batches.find(b => b.id === selectedBatchId) || null;
  }, [batches, selectedBatchId]);

  // Stop/cancel active batch
  const stopBatchExecution = async (batchId: string) => {
    try {
      const response = await fetchWithRetry(`/api/batches/${batchId}/stop`, { method: 'POST' }, 3, 1000);
      const data = await response.json();
      if (data.success) {
        addLog(`Verificação forçada para parar no lote: ${data.batch?.name}`);
        fetchBatches(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Delete batch handler
  const deleteBatch = async (batchId: string, name: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o lote "${name}" do histórico corporativo?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/batches/${batchId}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        addLog(`Lote "${name}" removido com sucesso.`);
        // Remove selection safely
        if (selectedBatchId === batchId) {
          setSelectedBatchId(null);
        }
        fetchBatches(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Delete all batches from history
  const clearAllHistory = async () => {
    if (!window.confirm("ATENÇÃO: Deseja realmente esvaziar todo o histórico e planilhas armazenadas no servidor?")) {
      return;
    }

    try {
      const response = await fetch('/api/batches/clear-all', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        addLog("Histórico corporativo totalmente limpo.");
        setBatches([]);
        setSelectedBatchId(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Compute filtered table URL rows from the selected batch
  const filteredResults = useMemo(() => {
    if (!activeBatch) return [];

    return activeBatch.results.filter(item => {
      // URL match
      const matchesSearch = item.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.coverageState && item.coverageState.toLowerCase().includes(searchQuery.toLowerCase()));
      
      // Status category match
      let matchesStatus = true;
      if (statusFilter !== 'all') {
        if (statusFilter === 'indexed') {
          matchesStatus = item.status === 'indexed';
        } else if (statusFilter === 'not_indexed') {
          matchesStatus = item.status === 'not_indexed';
        } else if (statusFilter === 'checking') {
          matchesStatus = item.status === 'checking' || item.status === 'pending';
        } else if (statusFilter === 'error') {
          matchesStatus = item.status === 'error';
        }
      }

      return matchesSearch && matchesStatus;
    });
  }, [activeBatch, searchQuery, statusFilter]);

  // Export spreadsheet rows directly to high-compatibility CSV File
  const handleExportCsv = () => {
    if (!activeBatch) {
      alert("Nenhum lote selecionado para exportação.");
      return;
    }

    const rows = activeBatch.results;
    if (rows.length === 0) {
      alert("Nenhum resultado disponível no lote selecionado.");
      return;
    }

    // Prepare header row
    const headers = [
      'URL Avaliada',
      'Status de Indexação',
      'Estado de Cobertura (GSC)',
      'Propriedade GSC Usada',
      'Data do Último Rastreio (Crawl)',
      'Agente Especial (Crawler)',
      'Estado Robots.txt',
      'Etiqueta de Indexação (noindex)',
      'Última Atualização no Monitor'
    ];

    // Map content rows and sanitize comma characters
    const csvContent = rows.map(item => {
      return [
        `"${item.url}"`,
        `"${item.status === 'indexed' ? 'INDEXADA' : item.status === 'not_indexed' ? 'NÃO INDEXADA' : item.status === 'checking' ? 'PROCESSANDO' : item.status === 'pending' ? 'PENDENTE' : 'FALHA/ERRO'}"`,
        `"${formatGscLabel(item.coverageState || '').replace(/"/g, '""')}"`,
        `"${(item.propertyUsed || '').replace(/"/g, '""')}"`,
        `"${item.lastCrawlTime ? new Date(item.lastCrawlTime).toLocaleString('pt-BR') : 'Sem histórico'}"`,
        `"${item.googleBotMobile ? 'Googlebot Smartphone' : 'Googlebot Desktop'}"`,
        `"${formatGscLabel(item.robotsTxtState || 'DESCONHECIDO')}"`,
        `"${formatGscLabel(item.indexingState || 'DESCONHECIDO')}"`,
        `"${item.updatedAt ? new Date(item.updatedAt).toLocaleString('pt-BR') : ''}"`
      ].join(',');
    });

    // Add unicode BOM flag to ensure Portuguese accent compatibility with Microsoft Excel
    const BOM = '\uFEFF';
    const csvData = BOM + [headers.join(','), ...csvContent].join('\n');
    
    // Create Blob and fire download action
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    // Format sanitized filename
    const cleanName = activeBatch.name.toLowerCase().replace(/[^a-z0-9]/gi, '_');
    link.setAttribute("href", url);
    link.setAttribute("download", `gsc_monitor_${cleanName}_${new Date().toISOString().slice(0, 10)}.csv`);
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    addLog(`Relatório CSV exportado do lote: ${activeBatch.name}`);
  };

  const escapeHtml = (value: unknown) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const formatGscLabel = (value: unknown) => {
    const text = String(value ?? '').trim();
    if (!text) return '';

    const labels: Record<string, string> = {
      'PASS': 'Aprovado',
      'FAIL': 'Falha',
      'NEUTRAL': 'Neutro',
      'PARTIAL': 'Parcial',
      'URL is unknown to Google': 'URL desconhecida pelo Google',
      'Crawled - currently not indexed': 'Rastreada, mas ainda nao indexada',
      'Discovered - currently not indexed': 'Descoberta, mas ainda nao indexada',
      'Submitted and indexed': 'Enviada e indexada',
      'Indexed, not submitted in sitemap': 'Indexada, mas nao enviada no sitemap',
      'Page is indexed': 'Pagina indexada',
      'Page is not indexed': 'Pagina nao indexada',
      'Alternate page with proper canonical tag': 'Pagina alternativa com canonical correto',
      'Duplicate without user-selected canonical': 'Duplicada sem canonical escolhido pelo usuario',
      'Duplicate, Google chose different canonical than user': 'Duplicada; o Google escolheu outro canonical',
      'Duplicate, submitted URL not selected as canonical': 'Duplicada; URL enviada nao foi escolhida como canonical',
      "Excluded by 'noindex' tag": 'Excluida por tag noindex',
      'Blocked by robots.txt': 'Bloqueada pelo robots.txt',
      'Soft 404': 'Soft 404',
      'Not found (404)': 'Nao encontrada (404)',
      'Redirect error': 'Erro de redirecionamento',
      'Page with redirect': 'Pagina com redirecionamento',
      'Server error (5xx)': 'Erro do servidor (5xx)',
      'Blocked due to access forbidden (403)': 'Bloqueada por acesso proibido (403)',
      'Blocked due to other 4xx issue': 'Bloqueada por outro problema 4xx',
      'Blocked due to unauthorized request (401)': 'Bloqueada por requisicao nao autorizada (401)',
      'Submitted URL blocked by robots.txt': 'URL enviada bloqueada pelo robots.txt',
      "Submitted URL marked 'noindex'": 'URL enviada marcada como noindex',
      'Submitted URL not found (404)': 'URL enviada nao encontrada (404)',
      'Submitted URL seems to be a Soft 404': 'URL enviada parece ser Soft 404',
      'Submitted URL has crawl issue': 'URL enviada tem problema de rastreamento',
      'Submitted URL has server error (5xx)': 'URL enviada tem erro do servidor (5xx)',
      'ROBOTS_TXT_STATE_UNSPECIFIED': 'Sem dados de robots.txt',
      'ROBOTS_TXT_STATE_ALLOWED': 'Permitido pelo robots.txt',
      'ROBOTS_TXT_STATE_DISALLOWED': 'Bloqueado pelo robots.txt',
      'INDEXING_STATE_UNSPECIFIED': 'Sem dados de diretiva de indexacao',
      'INDEXING_STATE_INDEXING_ALLOWED': 'Indexacao permitida',
      'INDEXING_STATE_BLOCKED_BY_META_TAG': 'Bloqueado por meta tag noindex',
      'INDEXING_STATE_BLOCKED_BY_HTTP_HEADER': 'Bloqueado por cabecalho HTTP',
      'ALLOWED': 'Permitido',
      'DISALLOWED': 'Bloqueado',
      'BLOCKED': 'Bloqueado',
      'INDEXING_ALLOWED': 'Indexacao permitida',
      'BLOCKED_BY_META_TAG': 'Bloqueado por noindex',
      'BLOCKED_BY_HTTP_HEADER': 'Bloqueado por cabecalho HTTP',
      'MOBILE': 'Googlebot Smartphone',
      'DESKTOP': 'Googlebot Desktop',
      'CRAWLING_USER_AGENT_UNSPECIFIED': 'Crawler nao informado',
      'VERDICT_UNSPECIFIED': 'Veredito nao informado',
      'You do not own this site, or the inspected URL is not part of this property.': 'Voce nao tem permissao nesta propriedade, ou a URL inspecionada nao pertence a ela.'
    };

    return labels[text] || text;
  };

  const getCoverageText = (item: UrlCheckResult) => {
    return formatGscLabel(item.coverageState || item.errorMessage || 'Concluido');
  };

  const buildResultsHtmlTable = (rows: UrlCheckResult[]) => {
    const statusLabel = (status: IndexingStatus) => {
      if (status === 'indexed') return 'Indexada';
      if (status === 'not_indexed') return 'Nao indexada';
      if (status === 'checking') return 'Processando';
      if (status === 'pending') return 'Pendente';
      return 'Erro';
    };

    const bodyRows = rows.map(item => {
      const lastCrawl = item.lastCrawlTime ? new Date(item.lastCrawlTime).toLocaleString('pt-BR') : 'Sem historico';
      return `    <tr>
      <td><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url)}</a></td>
      <td>${escapeHtml(statusLabel(item.status))}</td>
      <td>${escapeHtml(formatGscLabel(item.coverageState || item.errorMessage || ''))}</td>
      <td>${escapeHtml(item.propertyUsed || '')}</td>
      <td>${escapeHtml(lastCrawl)}</td>
      <td>${escapeHtml(formatGscLabel(item.robotsTxtState || ''))}</td>
      <td>${escapeHtml(formatGscLabel(item.indexingState || ''))}</td>
    </tr>`;
    }).join('\n');

    return `<table border="1" cellpadding="8" cellspacing="0">
  <thead>
    <tr>
      <th>URL</th>
      <th>Condicao de indexacao</th>
      <th>Estado de cobertura</th>
      <th>Propriedade GSC usada</th>
      <th>Ultimo rastreio</th>
      <th>Robots.txt</th>
      <th>Diretiva de indexacao</th>
    </tr>
  </thead>
  <tbody>
${bodyRows}
  </tbody>
</table>`;
  };

  const handleCopyHtmlTable = async () => {
    if (!activeBatch || activeBatch.results.length === 0) {
      alert("Nenhum lote selecionado para gerar HTML.");
      return;
    }

    const html = buildResultsHtmlTable(activeBatch.results);
    await navigator.clipboard.writeText(html);
    addLog(`Tabela HTML copiada do lote: ${activeBatch.name}`);
    alert("Tabela HTML copiada para a area de transferencia.");
  };

  const handleLogout = () => {
    localStorage.removeItem('gsc_session_token');
    localStorage.removeItem('gsc_session_user');
    setToken(null);
    setCurrentUser(null);
  };

  // Render auth guard
  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center font-sans text-white">
        <div className="text-center space-y-4">
          <RefreshCw className="w-10 h-10 animate-spin text-blue-400 mx-auto" />
          <p className="text-sm text-slate-400 animate-pulse font-mono">Autenticando sessão segura de usuário corporativo...</p>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <LoginModal 
        onLoginSuccess={(tok, usr) => {
          setToken(tok);
          setCurrentUser(usr);
        }} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans select-none antialiased">
      
      {/* HEADER BAR */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-650 rounded-lg flex items-center justify-center shadow-md">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-800 flex items-center gap-2">
                GSC Batch Indexer <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 rounded-sm">V3.1 PRO</span>
              </h1>
              <p className="text-xs text-slate-500">Monitoramento e Auditoria Interna de URLs de Destino</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            
            {/* Operator tag */}
            <div className="text-right hidden sm:block">
              <span className="text-slate-400 text-[10px] uppercase font-semibold tracking-wider block">Usuário Autenticado</span>
              <span className="text-sm font-semibold text-slate-800">{currentUser?.name || "Administrador"}</span>
            </div>

            {/* Quick configurations toggle */}
            <button
              onClick={() => setShowSettings(true)}
              className="px-3.5 py-2 hover:bg-slate-100 text-slate-700 hover:text-indigo-600 text-sm font-semibold rounded-lg border border-slate-250 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden md:inline">Configurações API</span>
            </button>

            {/* Logout button */}
            <button
              onClick={handleLogout}
              className="px-3.5 py-2 bg-slate-105 hover:bg-slate-200 text-slate-700 hover:text-red-600 text-sm font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair</span>
            </button>

          </div>
        </div>
      </header>

      {/* DASHBOARD STRUCTURE (BENTO GRID STYLE WITH SOLID COMPACT SHEETS) */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 space-y-5">
        
        {/* ROW 1: QUICK BENTO TILES OR BATCH LIST BAR */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          
          {/* BENTO CARD 1: ACTIVE CREDENTIAL STATUS (col-span-4) */}
          <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${isSimulated ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500 animate-pulse'}`} />
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-450">Canal de Comunicação</h3>
                </div>
                
                <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 font-bold rounded-sm ${
                  isSimulated ? 'bg-amber-100/80 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {isSimulated ? 'Ambiente Sandbox' : 'GSC API Ativa'}
                </span>
              </div>

              <div className="space-y-2 mt-4">
                <div className="text-xs text-slate-600 flex justify-between">
                  <span className="text-slate-400">Modo de Operação:</span>
                  <span className="font-semibold">{isSimulated ? 'Dados Simulados' : 'Google Search Console'}</span>
                </div>
                
                <div className="text-xs text-slate-600 flex justify-between gap-3">
                  <span className="text-slate-400">Propriedades:</span>
                  <span className="font-semibold text-right">
                    {propertyStrategy === 'domain' ? 'Multi-site por dominio raiz' :
                     propertyStrategy === 'host' ? 'Multi-site por host/subdominio' :
                     propertyStrategy === 'origin' ? 'URL-prefix automatico' :
                     'Propriedade fixa'}
                  </span>
                </div>

                {siteUrl ? (
                  <div className="text-xs text-slate-600 space-y-1">
                    <p className="text-slate-450 text-[10px] uppercase font-semibold">Propriedade Vinculada:</p>
                    <p className="bg-slate-50 font-mono text-[11px] p-2 border border-slate-200 rounded truncate hover:text-indigo-600 transition-colors" title={siteUrl}>
                      {siteUrl}
                    </p>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 border border-dashed border-slate-300 rounded text-center text-xs text-slate-500">
                    Nenhuma propriedade GSC salva para o modo Produção.
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2 pt-4 border-t border-slate-100 mt-4">
              <button 
                onClick={() => setShowSettings(true)}
                className="w-full py-2 bg-indigo-50 hover:bg-indigo-150 text-indigo-700 hover:text-indigo-800 text-xs font-bold rounded-lg border border-indigo-100/60 transition cursor-pointer text-center"
              >
                Alternar Credenciais / APIs
              </button>
              <p className="text-[10px] text-slate-400 text-center italic">
                {isSimulated ? 'Sandbox livre ativo para testes em lote' : 'Tokens OAuth renovam automaticamente'}
              </p>
            </div>
          </div>

          {/* BENTO CARD 2: BATCH INPUT FORM (col-span-8) */}
          <div className="lg:col-span-8">
            <BatchForm 
              onSubmitSuccess={handleBatchFormSubmit} 
              siteUrlSuggestion={siteUrl}
              isSimulated={isSimulated}
            />
          </div>

        </div>

        {/* STATS SUMMARY BAR */}
        {activeBatch && (
          <div className="mb-1 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Métricas do lote selecionado: <span className="text-indigo-650 font-bold">{activeBatch.name}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  id="export-csv-btn"
                  onClick={handleExportCsv}
                  disabled={!activeBatch || activeBatch.results.length === 0}
                  className="h-9 px-3 bg-slate-900 hover:bg-black disabled:bg-slate-300 text-white text-xs font-bold rounded-lg shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar CSV</span>
                </button>
                <button
                  id="copy-html-table-btn"
                  onClick={handleCopyHtmlTable}
                  disabled={!activeBatch || activeBatch.results.length === 0}
                  className="h-9 px-3 bg-white hover:bg-slate-50 disabled:bg-slate-100 text-slate-800 disabled:text-slate-400 text-xs font-bold rounded-lg border border-slate-250 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  <Clipboard className="w-4 h-4" />
                  <span>Copiar HTML</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowSystemLogs((value) => !value)}
                  className={`h-9 px-3 text-xs font-bold rounded-lg border transition flex items-center justify-center gap-2 cursor-pointer ${
                    showSystemLogs
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-250 hover:bg-slate-50'
                  }`}
                >
                  <Terminal className="w-4 h-4" />
                  <span>{showSystemLogs ? 'Ocultar logs' : 'Ver logs'}</span>
                </button>
                {batches.length > 0 && (
                  <button
                    onClick={clearAllHistory}
                    className="h-9 px-3 text-slate-500 hover:text-rose-600 hover:bg-rose-50 text-xs font-bold rounded-lg border border-slate-200 hover:border-rose-100 transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Limpar histórico</span>
                  </button>
                )}
              </div>
            </div>
            <StatsCards results={activeBatch.results} />
          </div>
        )}

        {showSystemLogs && (
          <div className="bg-slate-900 rounded-2xl p-4 text-white shadow-lg w-full">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span>Logs de Rede do Sistema</span>
              </h4>
              <div className="flex gap-1.5 items-center">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[9px] font-mono text-emerald-400 uppercase font-semibold">Live Feed</span>
              </div>
            </div>
            <div className="max-h-40 overflow-y-auto font-mono text-[10px] space-y-2 pr-1 leading-relaxed text-slate-350">
              {systemLogs.map((log, idx) => (
                <p key={idx} className={
                  log.includes('GSC API Ativa') || log.includes('PRODUÇÃO') ? 'text-emerald-300' :
                  log.includes('Simulado') || log.includes('SANDBOX') ? 'text-amber-300' :
                  log.includes('Progresso') ? 'text-blue-300' : 'text-slate-350'
                }>
                  {log}
                </p>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {/* ROW 2: MAIN SPREADSHEET */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          
          {/* spreadsheet / table details */}
          <div className="xl:col-span-12 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            
            {/* Header filters */}
            <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/60">
              
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-450">Auditoria das URLs</h3>
                  
                  {/* Batch Selection selector */}
                  {batches.length > 0 && (
                    <select
                      id="batch_selector"
                      className="text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                      value={selectedBatchId || ''}
                      onChange={(e) => {
                        setSelectedBatchId(e.target.value);
                        addLog(`Visualizando lote: ${batches.find(b => b.id === e.target.value)?.name}`);
                      }}
                    >
                      {batches.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.totalUrls} URLs)
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                
                {activeBatch && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <p className="text-[11px] text-slate-500">
                      Iniciado em: {new Date(activeBatch.createdAt).toLocaleString('pt-BR')} 
                    </p>
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                    <span className={`text-[10px] font-bold uppercase ${
                      activeBatch.status === 'completed' ? 'text-emerald-600' :
                      activeBatch.status === 'processing' ? 'text-indigo-600' : 'text-slate-500'
                    }`}>
                      {activeBatch.status === 'completed' ? 'Auditoria Concluída' :
                       activeBatch.status === 'processing' ? 'Análise em Andamento...' : 'Parado'}
                    </span>
                  </div>
                )}
              </div>

              {/* Filtering block */}
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                
                {/* Search */}
                <div className="relative flex-grow md:flex-grow-0">
                  <Search className="w-4 h-4 text-slate-450 absolute left-3 top-2.5" />
                  <input
                    id="search_url_input"
                    type="text"
                    placeholder="Filtrar URL ou estado..."
                    className="pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-500 w-full md:w-48"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                {/* Status Selection Filter */}
                <div className="flex gap-1 bg-slate-250/60 p-1 rounded-lg border border-slate-200">
                  <button
                    onClick={() => setStatusFilter('all')}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition cursor-pointer ${
                      statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-505 hover:text-slate-900'
                    }`}
                  >
                    Tudo
                  </button>
                  <button
                    onClick={() => setStatusFilter('indexed')}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition cursor-pointer ${
                      statusFilter === 'indexed' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-505 hover:text-slate-900'
                    }`}
                  >
                    Indexados
                  </button>
                  <button
                    onClick={() => setStatusFilter('not_indexed')}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition cursor-pointer ${
                      statusFilter === 'not_indexed' ? 'bg-white text-amber-700 shadow-xs' : 'text-slate-505 hover:text-slate-900'
                    }`}
                  >
                    Excluídos
                  </button>
                  <button
                    onClick={() => setStatusFilter('error')}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition cursor-pointer ${
                      statusFilter === 'error' ? 'bg-white text-rose-700 shadow-xs' : 'text-slate-505 hover:text-slate-900'
                    }`}
                  >
                    Erros
                  </button>
                </div>

              </div>

            </div>

            {/* LIVE OPERATION LOADER BANNER (IF BATCH RUNNING) */}
            {activeBatch && activeBatch.status === 'processing' && (
              <div className="bg-gradient-to-r from-blue-500/10 to-indigo-550/10 px-5 py-3 border-b border-blue-100 flex items-center justify-between text-xs text-indigo-900 animate-pulse">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-650" />
                  <span>Análise em tempo real: verificando URLs no barramento GSC (<strong className="font-semibold">{activeBatch.checkedUrls} de {activeBatch.totalUrls}</strong> concluídas)</span>
                </div>
                <button
                  type="button"
                  onClick={() => stopBatchExecution(activeBatch.id)}
                  className="px-2 py-1 text-[10px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded flex items-center gap-1 transition cursor-pointer"
                >
                  <StopCircle className="w-3.5 h-3.5" />
                  <span>Parar Auditoria</span>
                </button>
              </div>
            )}

            {/* DATA SHEET SPREADSHEET TABULAR */}
            <div className="overflow-x-auto min-h-[300px]">
              {activeBatch ? (
                filteredResults.length > 0 ? (
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-100/80 border-b border-slate-205">
                      <tr>
                        <th className="px-5 py-3.5 text-xs font-semibold text-slate-600">URL Alvo</th>
                        <th className="px-5 py-3.5 text-xs font-semibold text-slate-600 text-center">Crawler (Robô)</th>
                        <th className="px-5 py-3.5 text-xs font-semibold text-slate-600">Estado de Cobertura</th>
                        <th className="px-5 py-3.5 text-xs font-semibold text-slate-600">Propriedade GSC</th>
                        <th className="px-5 py-3.5 text-xs font-semibold text-slate-600 text-center">Último Rastreio</th>
                        <th className="px-5 py-3.5 text-xs font-semibold text-slate-600 text-center">Indexação / Status</th>
                        <th className="px-5 py-3.5 text-xs font-semibold text-slate-600 text-right">Diretiva HTML / Robots</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 bg-white">
                      {filteredResults.map((item, index) => {
                        return (
                          <tr key={index} className="hover:bg-slate-50/70 transition-colors">
                            
                            {/* URL and copy trigger */}
                            <td className="px-5 py-4 max-w-sm truncate">
                              <div className="font-mono text-xs text-slate-700 tracking-tight" title={item.url}>
                                {item.url}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <a 
                                  href={item.url} 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  className="text-[10px] text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
                                >
                                  <span>Visualizar URL</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                                {item.status === 'indexed' && (
                                  <>
                                    <span className="text-slate-300">|</span>
                                    <a 
                                      href={`https://search.google.com/search-console?resource_id=${encodeURIComponent(siteUrl || '')}`}
                                      target="_blank" 
                                      rel="noreferrer" 
                                      className="text-[10px] text-slate-500 hover:text-slate-700 italic"
                                    >
                                      Inspecionar no GSC
                                    </a>
                                  </>
                                )}
                              </div>
                            </td>

                            {/* Crawled user agent */}
                            <td className="px-5 py-4 text-center">
                              {item.status !== 'pending' && item.status !== 'checking' ? (
                                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-sm ${
                                  item.googleBotMobile ? 'bg-cyan-50 text-cyan-800 border border-cyan-150' : 'bg-slate-100 text-slate-700'
                                }`}>
                                  {item.googleBotMobile ? 'Smart_Mobile' : 'Desktop_Agent'}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-mono text-[10px]">-</span>
                              )}
                            </td>

                            {/* Coverage detail tag explanation */}
                            <td className="px-5 py-4 text-xs">
                              {item.status === 'checking' ? (
                                <span className="text-blue-600 font-semibold animate-pulse">Solicitando dados ao GSC...</span>
                              ) : item.status === 'pending' ? (
                                <span className="text-slate-400">Aguardando na fila...</span>
                              ) : item.errorMessage ? (
                                <span className="text-rose-600 font-medium" title={item.errorMessage}>
                                  Erro: {formatGscLabel(item.errorMessage)}
                                </span>
                              ) : (
                                <div className="space-y-0.5">
                                  <span className="text-slate-800 font-medium">{getCoverageText(item)}</span>
                                  {item.indexingState && (
                                    <p className="text-[10px] text-slate-550 block font-mono">GSC: {formatGscLabel(item.indexingState)}</p>
                                  )}
                                </div>
                              )}
                            </td>

                            <td className="px-5 py-4 text-xs">
                              <span className="font-mono text-[11px] text-slate-600" title={item.propertyUsed || ''}>
                                {item.propertyUsed || '-'}
                              </span>
                            </td>

                            {/* Last Crawl time in Brasil formatting */}
                            <td className="px-5 py-4 text-xs text-center text-slate-600">
                              {item.lastCrawlTime ? (
                                <div className="space-y-0.5">
                                  <span className="font-medium text-slate-800">
                                    {new Date(item.lastCrawlTime).toLocaleDateString('pt-BR')}
                                  </span>
                                  <p className="text-[10px] text-slate-400 block font-mono">
                                    {new Date(item.lastCrawlTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-slate-400 italic font-mono text-[11px]">Nunca</span>
                              )}
                            </td>

                            {/* INDEX VERDICT BADGE STATUS */}
                            <td className="px-5 py-4 text-center">
                              <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full uppercase shrink-0 ${
                                item.status === 'indexed' 
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                                  : item.status === 'not_indexed' 
                                    ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                                    : item.status === 'checking' 
                                      ? 'bg-blue-100 text-blue-800 border border-blue-200 animate-pulse' 
                                      : item.status === 'error'
                                        ? 'bg-rose-100 text-rose-800 border border-rose-200 font-bold'
                                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}>
                                {item.status === 'indexed' && 'Indexado'}
                                {item.status === 'not_indexed' && 'Sem Index'}
                                {item.status === 'checking' && 'Processando'}
                                {item.status === 'pending' && 'Pendente'}
                                {item.status === 'error' && 'Falha GSC'}
                              </span>
                            </td>

                            {/* Robots directive status */}
                            <td className="px-5 py-4 text-right">
                              {item.status !== 'pending' && item.status !== 'checking' ? (
                                <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-sm ${
                                  item.robotsTxtState === 'PERMITIDO' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                                }`}>
                                  {formatGscLabel(item.robotsTxtState || 'DESCONHECIDO')}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-mono text-[10px]">-</span>
                              )}
                            </td>

                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-12 text-center text-slate-500 font-sans space-y-2">
                    <p className="font-semibold text-slate-700 text-sm">Nenhum resultado filtrado coincide.</p>
                    <p className="text-xs text-slate-400">Tente reduzir os termos do filtro ou use outro seletor de status acima.</p>
                  </div>
                )
              ) : (
                <div className="p-12 text-center text-slate-400 space-y-4">
                  <div className="w-12 h-12 bg-slate-100 border border-slate-200 rounded-full flex items-center justify-center mx-auto text-slate-350">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-700 text-sm">Sem Lotes Registrados</p>
                    <p className="text-xs">Use o formulário bento acima para enviar sua primeira lista e monitorar!</p>
                  </div>
                </div>
              )}
            </div>

            {/* Pagination / Total count summary */}
            {activeBatch && (
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs text-slate-505">
                <span>Exibindo <strong>{filteredResults.length}</strong> de um total de <strong>{activeBatch.results.length}</strong> URLs auditadas no lote.</span>
                <span className="hidden sm:inline italic">Atualizações em andamento automático via background</span>
              </div>
            )}

          </div>

        </div>

        {/* REGIONAL HISTORY LISTING BOTTOM CARDS */}
        {batches.length > 1 && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 shadow-xs">
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-450 flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-650" />
              <span>Arquivo e Histórico de Consultas Lote</span>
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {batches.map(b => (
                <div 
                  key={b.id} 
                  className={`p-3.5 rounded-lg border text-xs transition cursor-pointer ${
                    b.id === selectedBatchId 
                      ? 'bg-indigo-50/50 border-indigo-400 shadow-xs' 
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                  }`}
                  onClick={() => {
                    setSelectedBatchId(b.id);
                    addLog(`Alternado para histórico: ${b.name}`);
                  }}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-semibold text-slate-850 truncate max-w-[180px] block" title={b.name}>
                      {b.name}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteBatch(b.id, b.name);
                      }}
                      className="text-slate-400 hover:text-rose-600 p-0.5 rounded transition cursor-pointer"
                      title="Excluir lote"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                    <span>{b.totalUrls} URLs cadastradas</span>
                    <span className={`font-bold ${
                      b.status === 'completed' ? 'text-emerald-600' : 'text-slate-500'
                    }`}>
                      {b.status === 'completed' ? 'CONCLUÍDO' : 'PENDENTE'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>

      {/* FOOTER BAR */}
      <footer className="mt-auto bg-white border-t border-slate-205 py-4 px-6 text-[11px] text-slate-400 font-medium">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-2">
          <div>© 2026 Auditores de Indexação • Ferramenta Interna de Segurança GSC</div>
          <div className="flex gap-4">
            <span className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> 
              Status de Integração: Estável
            </span>
            <span>Local: São Paulo, BR</span>
          </div>
        </div>
      </footer>

      {/* RENDER DYNAMIC CONFIG MODAL */}
      {showSettings && (
        <GscSettings 
          onClose={() => setShowSettings(false)} 
          onSaveSuccess={() => {
            fetchGscConfig();
            addLog("Novas credenciais de API salvas!");
          }} 
        />
      )}

    </div>
  );
}
