import React, { useState, useEffect } from 'react';
import { Settings, Save, AlertCircle, RefreshCw, X, BadgeAlert, Sparkles, Server, Copy, Check, HelpCircle } from 'lucide-react';
import { GscCredentials, OperationMode, PropertyStrategy } from '../types';

interface GscSettingsProps {
  onClose: () => void;
  onSaveSuccess: () => void;
}

export default function GscSettings({ onClose, onSaveSuccess }: GscSettingsProps) {
  const [mode, setMode] = useState<OperationMode>('simulated');
  const [siteUrl, setSiteUrl] = useState('');
  const [propertyStrategy, setPropertyStrategy] = useState<PropertyStrategy>('domain');
  const [propertyMappings, setPropertyMappings] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);

  useEffect(() => {
    // Fetch active configurations on mount
    const fetchConfig = async () => {
      try {
        const response = await fetch('/api/config');
        const data = await response.json();
        if (data.success) {
          setMode(data.mode);
          setSiteUrl(data.siteUrl);
          setPropertyStrategy(data.propertyStrategy || 'domain');
          setPropertyMappings(data.propertyMappings || '');
          setClientEmail(data.clientEmail);
          setApiKey(data.apiKey || '');
          if (data.hasPrivateKey) {
            setPrivateKey('••••••••••••••••••••••••••••••••');
          }
        }
      } catch (err) {
        console.error('Erro ao buscar configuração:', err);
      }
    };
    fetchConfig();
  }, []);

  const handleCopyEmail = () => {
    if (!clientEmail) return;
    navigator.clipboard.writeText(clientEmail);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    // Sanitize values
    let cleanPrivateKey = privateKey;
    if (privateKey === '••••••••••••••••••••••••••••••••') {
      cleanPrivateKey = ''; // Do not send placeholder to overwrite
    }

    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode,
          siteUrl: siteUrl.trim(),
          propertyStrategy,
          propertyMappings,
          clientEmail: clientEmail.trim(),
          privateKey: cleanPrivateKey,
          apiKey: apiKey.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao salvar configurações.');
      }

      setMessage('Configurações armazenadas com sucesso no servidor!');
      onSaveSuccess();
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Houve um erro técnico de salvamento.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-sans animate-fade-in">
      <div className="w-full max-w-2xl bg-slate-900 rounded-xl border border-slate-700/60 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-800/60 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <Settings className="w-5 h-5 text-blue-400 animate-spin-slow" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Configurações de API GSC</h2>
              <p className="text-slate-400 text-xs">Configure o modo operacional e credenciais do Google Search Console</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-200 p-1 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm rounded-lg flex items-start gap-2 animate-fade-in">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {message && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm rounded-lg flex items-start gap-2 animate-fade-in">
              <span className="w-5 h-5 flex items-center justify-center bg-emerald-500 text-slate-900 font-bold rounded-full text-xs shrink-0">✓</span>
              <span>{message}</span>
            </div>
          )}

          {/* Operation Mode selector */}
          <div className="space-y-3">
            <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wider">
              Modo Operacional de Verificação
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Option 1: Sandbox */}
              <div 
                onClick={() => setMode('simulated')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  mode === 'simulated' 
                    ? 'bg-blue-500/10 border-blue-500/60 shadow-[0_0_15px_rgba(59,130,246,0.06)]' 
                    : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800/70 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`p-1.5 rounded-md ${mode === 'simulated' ? 'bg-blue-400/20 text-blue-400' : 'bg-slate-700 text-slate-400'}`}>
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <h4 className="font-semibold text-sm text-white">Simulador / Sandbox</h4>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Avalie o monitor de indexação instantaneamente com dados simulados realistas. Perfeito para testes, tutoriais ou demonstrações sem chaves ativas.
                </p>
              </div>

              {/* Option 2: Live API */}
              <div 
                onClick={() => setMode('production')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  mode === 'production' 
                    ? 'bg-emerald-500/10 border-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.06)]' 
                    : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800/70 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`p-1.5 rounded-md ${mode === 'production' ? 'bg-emerald-400/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                    <Server className="w-4 h-4" />
                  </div>
                  <h4 className="font-semibold text-sm text-white">Produção (API Real)</h4>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Conexão direta com a API do Google Search Console. Requer criação de conta de serviço no GCP e liberação de permissão de leitura.
                </p>
              </div>

            </div>
          </div>

          {/* GSC Config Input Form - conditionally highlighted or blocked based on mode */}
          <div className={`p-5 rounded-xl border transition-all ${mode === 'production' ? 'bg-slate-800/40 border-slate-700/80' : 'bg-slate-800/10 border-slate-800/40 opacity-75'}`}>
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              {mode === 'production' && <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
              Parâmetros do Google Search Console
            </h3>

            <div className="space-y-4">
              
              {/* Site Property URL */}
              <div>
                <label className="block text-slate-300 text-xs font-semibold mb-1">
                  URL da Propriedade no Search Console (Site URL) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 font-mono"
                  placeholder="ex: https://meusite.com/ ou sc-domain:meusite.com"
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                  required={mode === 'production' && propertyStrategy === 'configured'}
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Insira exatamente como exibido na lista de propriedades do Search Console (incluindo barras se for URL, ou prefixo <code className="text-slate-400 font-mono">sc-domain:</code> para propriedades de domínio).
                </p>
              </div>

              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
                <div>
                  <label className="block text-slate-200 text-xs font-semibold mb-1">
                    Como escolher a propriedade para cada URL
                  </label>
                  <select
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                    value={propertyStrategy}
                    onChange={(e) => setPropertyStrategy(e.target.value as PropertyStrategy)}
                  >
                    <option value="domain">Automatico: sc-domain do dominio raiz (recomendado para muitos sites)</option>
                    <option value="host">Automatico: sc-domain do host completo/subdominio</option>
                    <option value="origin">Automatico: propriedade URL-prefix do dominio da URL</option>
                    <option value="configured">Usar somente a propriedade fixa acima</option>
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Para listas com muitos sites, use o modo automatico. Exemplo: uma URL em <code className="text-slate-400 font-mono">blog.aoseuservico.com.br</code> sera inspecionada em <code className="text-slate-400 font-mono">sc-domain:aoseuservico.com.br</code>.
                  </p>
                </div>

                <div>
                  <label className="block text-slate-300 text-xs font-semibold mb-1">
                    Excecoes / mapeamentos manuais por dominio
                  </label>
                  <textarea
                    className="w-full h-24 px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500 font-mono leading-relaxed"
                    placeholder={`esportes.dicas.inf.br=sc-domain:dicas.inf.br\nsiteprivado.provisorio.ws=https://siteprivado.provisorio.ws/`}
                    value={propertyMappings}
                    onChange={(e) => setPropertyMappings(e.target.value)}
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Opcional. Use quando algum site estiver cadastrado no Search Console de forma diferente do automatico. Uma regra por linha, no formato <code className="text-slate-400 font-mono">dominio=propriedade_gsc</code>.
                  </p>
                </div>
              </div>

              {/* Service Account Email */}
              <div>
                <label className="block text-slate-300 text-xs font-semibold mb-1 flex justify-between items-center">
                  <span>E-mail da Conta de Serviço (Client Email) <span className="text-rose-400">*</span></span>
                  {clientEmail && (
                    <button
                      type="button"
                      onClick={handleCopyEmail}
                      className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 cursor-pointer transition"
                    >
                      {copiedEmail ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400 font-bold">Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copiar e-mail</span>
                        </>
                      )}
                    </button>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="email"
                    className="w-full pl-3.5 pr-20 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 font-mono"
                    placeholder="ex: gsc-monitor@projeto.iam.gserviceaccount.com"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    required={mode === 'production'}
                  />
                  {clientEmail && (
                    <button
                      type="button"
                      onClick={handleCopyEmail}
                      className="absolute right-2 top-1.5 px-2 py-1 bg-slate-800 hover:bg-slate-705 border border-slate-700 rounded text-[10px] text-slate-300 hover:text-white font-medium flex items-center gap-1 transition-all cursor-pointer"
                      title="Copiar endereço de e-mail"
                    >
                      {copiedEmail ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedEmail ? 'Pronto' : 'Copiar'}</span>
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Gerado ao criar uma Conta de Serviço no painel IAM & Admin do Google Cloud Platform. <strong>Importante:</strong> Você precisa adicionar este e-mail como &quot;Leitor&quot; nas permissões da propriedade no Search Console!
                </p>
              </div>

              {/* Service Account Private Key */}
              <div>
                <label className="block text-slate-300 text-xs font-semibold mb-1">
                  Chave Privada do Service Account (PEM format) <span className="text-rose-400">*</span>
                </label>
                <textarea
                  className="w-full h-32 px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500 font-mono leading-relaxed"
                  placeholder="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC6...\n-----END PRIVATE KEY-----"
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  required={mode === 'production' && privateKey === ''}
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Copie o conteúdo interno de <code className="text-slate-400 font-mono">&quot;private_key&quot;</code> do arquivo JSON de chave privada gerado no Google Cloud Console. Garantimos criptografia e segurança no tráfego de servidores.
                </p>
              </div>

              {/* Developer API Key (Optional) */}
              <div>
                <label className="block text-slate-300 text-xs font-semibold mb-1">
                  Chave de API do Google Cloud (Opcional)
                </label>
                <input
                  type="password"
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 font-mono"
                  placeholder={apiKey ? "••••••••••••••••••••••••••••••••" : "AIzaSy..."}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Caso utilize restrição de cota por chave de API ou IP corporativo específica em chamadas secundárias.
                </p>
              </div>

            </div>
          </div>

          {/* Quick Guide */}
          <div className="bg-slate-800/30 rounded-xl p-5 border border-slate-700/30 space-y-4">
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <BadgeAlert className="w-4 h-4 text-indigo-400 shrink-0" />
                Como configurar e automatizar a API GSC?
              </h4>
              <ol className="text-xs text-slate-400 space-y-2.5 list-decimal pl-4 leading-relaxed">
                <li>
                  Acesse o <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className="text-blue-400 underline hover:text-blue-300">Google Cloud Console</a> e crie ou escolha um projeto.
                </li>
                <li>
                  Ative a <strong>Google Search Console API</strong> na aba APIs & Serviços &rarr; Biblioteca.
                </li>
                <li>
                  Vá em IAM e Administrador &rarr; <strong>Contas de Serviço</strong> e clique em &quot;Criar conta de serviço&quot;.
                </li>
                <li>
                  Após criar, acesse a conta, vá em <strong>Chaves (Keys)</strong> &rarr; Adicionar Chave &rarr; <strong>Criar nova chave (formato JSON)</strong>. Faça o download seguro da chave.
                </li>
                <li>
                  Abra o <a href="https://search.google.com/search-console/" target="_blank" rel="noreferrer" className="text-blue-400 underline hover:text-blue-300">Google Search Console</a> de seu site, vá em Configurações &rarr; Permissões &rarr; <strong>Adicionar Usuário</strong> e insira o e-mail da conta de serviço (<code className="text-slate-350 bg-slate-900 px-1 py-0.5 rounded text-[10px]">...gserviceaccount.com</code>) com nível de permissão <strong>Leitor (Reader)</strong> ou superior.
                </li>
                <li>
                  Cole os dados do arquivo JSON baixado nos inputs acima e salve para Ativar o modo de Produção!
                </li>
              </ol>
            </div>

            <div className="pt-3 border-t border-slate-800/80 space-y-2">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5 label-third-party">
                <HelpCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                Como Auditar Sites de Terceiros (Clientes ou Parceiros)?
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Por limitações oficiais de segurança do Google, a API do Search Console <strong>não permite</strong> inspecionar qualquer URL aberta na web sem autorização expressa do proprietário.
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Para auditar os sites de seus clientes ou parceiros de negócios utilizando a sua própria chave:
              </p>
              <ul className="text-xs text-slate-400 space-y-2 list-disc pl-4 leading-relaxed">
                <li>
                  <strong>Copie o seu E-mail de Conta de Serviço</strong> listado acima (ex: <code className="text-slate-350 bg-slate-900 px-1 py-0.5 rounded text-[10.5px]">...gserviceaccount.com</code>).
                </li>
                <li>
                  Solicite ao cliente/terceiro que acesse o painel do Search Console do site dele.
                </li>
                <li>
                  Peça para ele ir em <strong>Configurações &rarr; Usuários e Permissões &rarr; Adicionar Usuário</strong>, inserir o seu e-mail de conta de serviço e conceder a permissão de <strong>Leitor (Reader)</strong>.
                </li>
                <li>
                  Vincule a URL da propriedade dele no campo &quot;URL da Propriedade GSC&quot; acima e crie as verificações em lote para o site dele sem problemas!
                </li>
              </ul>
            </div>
          </div>

        </form>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-800/40 border-t border-slate-700/50 flex items-center justify-between">
          <p className="text-xs text-slate-500">Formato seguro HTTPS. Suas senhas nunca são reveladas.</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 text-slate-300 hover:text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition"
            >
              Cancelar
            </button>
            <button
              id="save-gsc-config"
              onClick={handleSave}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium shadow-lg transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{loading ? 'Salvando...' : 'Salvar Configuração'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
