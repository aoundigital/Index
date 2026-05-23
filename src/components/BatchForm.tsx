import React, { useState, useMemo } from 'react';
import { Send, ClipboardCheck, LayoutList, RefreshCcw, HelpCircle } from 'lucide-react';

interface BatchFormProps {
  onSubmitSuccess: (newBatchId: string) => void;
  siteUrlSuggestion?: string;
  isSimulated: boolean;
}

export default function BatchForm({ onSubmitSuccess, siteUrlSuggestion, isSimulated }: BatchFormProps) {
  const [name, setName] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compute number of filtered lines (non-empty URLs)
  const linesStats = useMemo(() => {
    const rawLines = urlInput.split('\n');
    const cleanLines = rawLines.map(l => l.trim()).filter(Boolean);
    return {
      total: rawLines.length,
      valid: cleanLines.length,
      list: cleanLines
    };
  }, [urlInput]);

  const loadExampleUrls = () => {
    setName(`Demonstração URL Lote #${Math.floor(Math.random() * 90) + 10}`);
    
    const targetDomain = siteUrlSuggestion && siteUrlSuggestion.startsWith('https://') 
      ? siteUrlSuggestion.replace(/\/$/, '') 
      : 'https://exemplo-empresa.com.br';

    const examples = [
      `${targetDomain}/`,
      `${targetDomain}/artigo/como-otimizar-seo-gsc-2026`,
      `${targetDomain}/produto/camera-dslr-profissional`,
      `${targetDomain}/noindex-pagina-privada-membros`,
      `${targetDomain}/blog/robots-bloqueado-rascunho`,
      `${targetDomain}/pagina-inexistente-erro-404-teste`,
      `${targetDomain}/ajuda/contato-atendimento-sucesso`
    ];
    setUrlInput(examples.join('\n'));
    setError(null);
  };

  const handleClear = () => {
    setUrlInput('');
    setName('');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (linesStats.valid === 0) {
      setError('Por favor, informe ao menos uma URL para inspecionar.');
      return;
    }

    if (linesStats.valid > 150) {
      setError('O lote máximo suportado nesta interface é de 150 URLs. Reduza sua lista.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/batches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim() || undefined,
          urls: linesStats.list,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Falha ao iniciar processamento do lote.');
      }

      // Success
      setName('');
      setUrlInput('');
      onSubmitSuccess(data.batch.id);
    } catch (err: any) {
      setError(err.message || 'Erro inesperado no servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-800/80 backdrop-blur-md rounded-xl border border-slate-700/60 p-6 shadow-xl font-sans">
      <div className="flex items-center justify-between mb-5 border-b border-slate-700/50 pb-4">
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <LayoutList className="w-5 h-5 text-blue-400" />
          <span>Enviar URLs em Lote</span>
        </h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadExampleUrls}
            className="px-2.5 py-1.5 bg-slate-700/50 hover:bg-slate-700 hover:text-blue-300 text-slate-300 rounded-lg text-xs font-medium transition flex items-center gap-1 cursor-pointer"
            title="Preencher com exemplos fictícios para demonstração"
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            <span>Carregar Exemplo</span>
          </button>
          
          {(urlInput || name) && (
            <button
              type="button"
              onClick={handleClear}
              className="px-2.5 py-1.5 bg-slate-700/20 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 rounded-lg text-xs transition flex items-center gap-1 cursor-pointer"
            >
              <RefreshCcw className="w-3.5 h-3.5" />
              <span>Limpar</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-lg animate-fade-in">
          ⚠️ {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        
        {/* Identifier / Name */}
        <div>
          <label className="block text-slate-300 text-xs font-semibold mb-1.5 uppercase tracking-wider">
            Identificador do Lote <span className="text-slate-500 font-normal">(Opcional)</span>
          </label>
          <input
            id="batch_name_input"
            type="text"
            className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            placeholder="Ex: Lote Blogs Maio - Redação"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* URLs Textarea */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wider">
              Lista de URLs de destino <span className="text-slate-500 font-normal">(Uma por linha)</span>
            </label>
            <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${
              linesStats.valid > 150 
                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' 
                : linesStats.valid > 0 
                  ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20' 
                  : 'bg-slate-700 text-slate-400'
            }`}>
              {linesStats.valid} / 150 URLs
            </span>
          </div>
          
          <textarea
            id="batch_urls_textarea"
            className="w-full h-44 px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs font-mono placeholder-slate-600 focus:outline-none focus:border-blue-500 leading-relaxed overflow-y-auto"
            placeholder={`Insira as URLs completas de destino a consultar, por exemplo:\nhttps://meusite.com/\nhttps://meusite.com/sobre-nos\nhttps://meusite.com/produtos/calca-sarja`}
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            disabled={loading}
          />
          
          <div className="flex items-start gap-1.5 mt-2 text-[11px] text-slate-400 leading-relaxed">
            <HelpCircle className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
            <p>
              {isSimulated ? (
                <span><strong>Dica de Simulação:</strong> Insira URLs contendo os termos <code className="text-slate-300 font-mono">noindex</code>, <code className="text-slate-300 font-mono">robots</code>, ou <code className="text-slate-300 font-mono">404</code> para forçar respostas de exclusão específicas no painel de resultados!</span>
              ) : (
                <span>As URLs podem ser de sites diferentes. No modo multi-site, o sistema escolhe a propriedade do Search Console para cada dominio automaticamente.</span>
              )}
            </p>
          </div>
        </div>

        {/* Execution button */}
        <button
          id="submit-batch-btn"
          type="submit"
          disabled={loading || linesStats.valid === 0 || linesStats.valid > 150}
          className="w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:from-slate-700 disabled:to-slate-700 text-white font-medium text-sm rounded-lg shadow-md transition-all uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="inline-block animate-spin rounded-full h-4.5 w-4.5 border-2 border-white border-t-transparent" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          <span>{loading ? 'Preparando e Registrando...' : 'Iniciar Verificação em Lote'}</span>
        </button>

      </form>
    </div>
  );
}
