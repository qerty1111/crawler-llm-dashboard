import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { PromptProfile, PromptBlocks, ReferenceSite } from '../types';
import { Card, Button, Input, Badge, cn } from '../components/ui';
import {
  Terminal, Save, History, Plus, Trash2, CheckCircle2,
  AlertCircle, Sparkles, Layers, FileCode, RotateCcw
} from 'lucide-react';

export const PromptPage: React.FC = () => {
  const [activeStage, setActiveStage] = useState<1 | 2>(1);
  const [profile, setProfile] = useState<PromptProfile | null>(null);
  const [assembledPrompt, setAssembledPrompt] = useState<string>('');
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states
  const [targetDescription, setTargetDescription] = useState('');
  const [exclusions, setExclusions] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [referenceSites, setReferenceSites] = useState<ReferenceSite[]>([]);
  const [newRefDomain, setNewRefDomain] = useState('');
  const [newRefDesc, setNewRefDesc] = useState('');

  const loadPrompt = async () => {
    setIsLoading(true);
    try {
      const [promptRes, histRes] = await Promise.all([
        api.getPrompt(activeStage),
        api.getPromptHistory(activeStage),
      ]);

      setProfile(promptRes.profile);
      setAssembledPrompt(promptRes.assembledPrompt);
      setHistory(histRes.history || []);

      if (promptRes.profile) {
        setTargetDescription(promptRes.profile.blocks.target_description || '');
        setExclusions(promptRes.profile.blocks.exclusions || '');
        setCategories(promptRes.profile.blocks.categories || []);
        setReferenceSites(promptRes.profile.blocks.reference_sites || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPrompt();
  }, [activeStage]);

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const blocks: PromptBlocks = {
      target_description: targetDescription,
      exclusions,
      categories,
      reference_sites: referenceSites,
    };

    try {
      const res = await api.updatePrompt(activeStage, blocks);
      setProfile(res.profile);
      setAssembledPrompt(res.assembledPrompt);
      setSuccessMsg('Профиль промпта успешно сохранен и отправлен скореру');
      loadPrompt();
    } catch (err: any) {
      setErrorMsg(err.message || 'Ошибка сохранения промпта');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRollback = (histItem: any) => {
    if (!window.confirm(`Откатить настройки промпта к версии ${histItem.version}?`)) return;

    setTargetDescription(histItem.blocks.target_description || '');
    setExclusions(histItem.blocks.exclusions || '');
    setCategories(histItem.blocks.categories || []);
    setReferenceSites(histItem.blocks.reference_sites || []);
  };

  const addCategory = () => {
    const val = newCategoryInput.trim();
    if (!val || categories.includes(val) || categories.length >= 12) return;
    setCategories([...categories, val]);
    setNewCategoryInput('');
  };

  const removeCategory = (cat: string) => {
    setCategories(categories.filter(c => c !== cat));
  };

  const addReferenceSite = () => {
    if (!newRefDomain.trim() || referenceSites.length >= 30) return;
    setReferenceSites([...referenceSites, { domain: newRefDomain.trim(), description: newRefDesc.trim() }]);
    setNewRefDomain('');
    setNewRefDesc('');
  };

  const removeReferenceSite = (idx: number) => {
    setReferenceSites(referenceSites.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Terminal className="w-6 h-6 text-brand-400" />
            <span>Конструктор и редактор промпта скорера</span>
          </h2>
          <p className="text-xs text-slate-400">
            Настройка блоков LLM-классификатора: целевые критерии, исключения, допустимые категории и эталоны
          </p>
        </div>

        {/* Stage 1 vs Stage 2 Switcher */}
        <div className="flex items-center gap-2 bg-surface-light border border-surface-border rounded-xl p-1">
          <button
            onClick={() => setActiveStage(1)}
            className={cn(
              'px-4 py-1.5 rounded-lg text-xs font-semibold transition-all',
              activeStage === 1
                ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            Этап 1 (Быстрый фильтр)
          </button>
          <button
            onClick={() => setActiveStage(2)}
            className={cn(
              'px-4 py-1.5 rounded-lg text-xs font-semibold transition-all',
              activeStage === 2
                ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            Этап 2 (Глубокий скоринг)
          </button>
        </div>
      </div>

      {/* Warning Notice Banner */}
      <div className="p-3.5 bg-brand-500/10 border border-brand-500/30 rounded-xl text-xs text-brand-200 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brand-400 flex-shrink-0" />
          <span>
            Изменения применятся к ссылкам, оценённым <span className="font-bold underline">после этого момента</span>. Ранее оценённые ссылки не переоцениваются.
          </span>
        </span>
        {profile && (
          <Badge variant="purple" size="sm" className="font-mono">
            Версия профиля: v{profile.version}
          </Badge>
        )}
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center gap-2 font-semibold">
          <CheckCircle2 className="w-4 h-4" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Main 2-Column Layout: Blocks Form (Left) & Assembled Preview (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        {/* Left: Editable Blocks */}
        <div className="space-y-5">
          {/* Block 1: Target Description */}
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white uppercase tracking-wider">
                1. Описание целевого продукта (Target Description)
              </label>
              <span className="text-[11px] font-mono text-slate-400">
                {targetDescription.length} / 1500 символов
              </span>
            </div>
            <textarea
              rows={4}
              maxLength={1500}
              value={targetDescription}
              onChange={(e) => setTargetDescription(e.target.value)}
              placeholder="Что именно мы ищем (PMS, Channel Manager, Booking Engine...)"
              className="w-full bg-surface-light border border-surface-border rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-colors resize-none leading-relaxed"
            />
          </Card>

          {/* Block 2: Exclusions */}
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white uppercase tracking-wider">
                2. Что отсекать (Exclusions)
              </label>
              <span className="text-[11px] font-mono text-slate-400">
                {exclusions.length} / 1500 символов
              </span>
            </div>
            <textarea
              rows={3}
              maxLength={1500}
              value={exclusions}
              onChange={(e) => setExclusions(e.target.value)}
              placeholder="Потребительские сайты, блоги, агрегаторы туров..."
              className="w-full bg-surface-light border border-surface-border rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-colors resize-none leading-relaxed"
            />
          </Card>

          {/* Block 3: Categories List */}
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white uppercase tracking-wider">
                3. Допустимые категории ({categories.length} / 12)
              </label>
            </div>

            <div className="flex flex-wrap gap-2 mb-2">
              {categories.map((cat) => (
                <span
                  key={cat}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-lighter border border-surface-border text-xs text-slate-200"
                >
                  <span>{cat}</span>
                  <button
                    type="button"
                    onClick={() => removeCategory(cat)}
                    className="text-slate-400 hover:text-rose-400"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Новая категория..."
                value={newCategoryInput}
                onChange={(e) => setNewCategoryInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCategory())}
                className="flex-1 bg-surface-light border border-surface-border rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500"
              />
              <Button variant="outline" size="sm" type="button" onClick={addCategory} className="text-xs">
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          </Card>

          {/* Block 4: Reference Sites Table */}
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white uppercase tracking-wider">
                4. Эталонные сайты ({referenceSites.length} / 30)
              </label>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {referenceSites.map((ref, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-3 p-2 bg-surface-light rounded-lg border border-surface-border text-xs"
                >
                  <span className="font-mono font-bold text-brand-300 w-36 truncate">{ref.domain}</span>
                  <span className="text-slate-300 text-[11px] flex-1 truncate">{ref.description}</span>
                  <button
                    type="button"
                    onClick={() => removeReferenceSite(idx)}
                    className="text-slate-400 hover:text-rose-400 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add Ref Site Row */}
            <div className="grid grid-cols-5 gap-2 pt-2 border-t border-surface-border">
              <input
                type="text"
                placeholder="domain.com"
                value={newRefDomain}
                onChange={(e) => setNewRefDomain(e.target.value)}
                className="col-span-2 bg-surface-light border border-surface-border rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500"
              />
              <input
                type="text"
                placeholder="Краткое описание вендора..."
                value={newRefDesc}
                onChange={(e) => setNewRefDesc(e.target.value)}
                className="col-span-2 bg-surface-light border border-surface-border rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500"
              />
              <Button variant="outline" size="sm" type="button" onClick={addReferenceSite} className="text-xs">
                Добавить
              </Button>
            </div>
          </Card>

          {/* Action Bar */}
          <div className="flex items-center justify-between pt-2">
            <Button variant="primary" size="lg" onClick={handleSave} disabled={isSaving} className="gap-2">
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Сохранение...' : 'Сохранить профиль промпта'}</span>
            </Button>
          </div>
        </div>

        {/* Right: Assembled Prompt Live Preview & Version History */}
        <div className="space-y-5">
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-surface-border">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Итоговый промпт для LLM (Read-only)</h3>
              </div>
              <Badge variant="outline" size="sm" className="font-mono text-[10px]">
                Каркас + подставленные блоки
              </Badge>
            </div>

            <pre className="p-4 bg-slate-950 rounded-xl border border-surface-border text-emerald-300 font-mono text-[11px] h-[520px] overflow-y-auto whitespace-pre-wrap leading-relaxed select-all">
              {assembledPrompt}
            </pre>
          </Card>

          {/* Version History List */}
          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-surface-border">
              <History className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-bold text-white">История версий промпта</h3>
            </div>

            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {history.length === 0 ? (
                <p className="text-xs text-slate-500">История изменений пуста</p>
              ) : (
                history.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between p-2.5 bg-surface-light rounded-xl border border-surface-border text-xs"
                  >
                    <div className="space-y-0.5">
                      <span className="font-mono font-bold text-purple-400">Версия v{h.version}</span>
                      <p className="text-[10px] text-slate-400">
                        Автор: @{h.actor_name} • {new Date(h.created_at).toLocaleString('ru-RU')}
                      </p>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRollback(h)}
                      className="text-xs gap-1 py-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Откатить
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
