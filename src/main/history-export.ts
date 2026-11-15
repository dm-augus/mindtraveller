import { AppError } from '../shared/app-error';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import type { AdventureStore } from './adventure-storage';
import type { HistoryExportResult } from '../shared/types';
import { formatHistory } from './history-formatter';
import { translate } from '../shared/i18n';
import type { InterfaceLanguage } from '../shared/types';

/** Reserve the adventure while a main-process operation or native dialog is active. */
export class AdventureOperationGate {
  private busy = false;
  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.busy) throw new AppError('error.busy');
    this.busy = true;
    try { return await operation(); } finally { this.busy = false; }
  }
}

export interface HistorySaveDialogOptions {
  title: string;
  defaultPath: string;
  filters: { name: string; extensions: string[] }[];
  properties: ('showOverwriteConfirmation' | 'createDirectory')[];
}

export function localizedHistoryDialogOptions(options: HistorySaveDialogOptions, locale: InterfaceLanguage): HistorySaveDialogOptions {
  return { ...options, title: translate(locale, 'export.title'),
    filters: options.filters.map(filter => ({ ...filter, name: translate(locale, 'export.filter') })) };
}
type ChooseDestination = (options: HistorySaveDialogOptions) => Promise<{ canceled: boolean; filePath?: string }>;
type ExportFiles = Pick<typeof fs, 'writeFile' | 'realpath'>;

export class HistoryExporter {
  constructor(
    private readonly store: Pick<AdventureStore, 'load' | 'directory'>,
    private readonly gate: AdventureOperationGate,
    private readonly chooseDestination: ChooseDestination,
    private readonly replacementPending: () => boolean,
    private readonly files: ExportFiles = fs
  ) {}

  export(): Promise<HistoryExportResult> {
    return this.gate.run(async () => {
      if (this.replacementPending()) throw new AppError('error.exportPending');
      const adventure = await this.store.load();
      if (!adventure?.segments.length) throw new AppError('error.exportEmpty');
      const snapshot = structuredClone(adventure);
      const text = formatHistory(snapshot);
      const name = snapshot.character.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/g, '').slice(0, 60) || 'Traveller';
      const result = await this.chooseDestination({ title: 'Export History',
        defaultPath: `Mindtraveller-${name}-${new Date().toISOString().slice(0, 10)}.md`,
        filters: [{ name: 'Markdown history', extensions: ['md'] }],
        properties: ['showOverwriteConfirmation', 'createDirectory'] });
      if (result.canceled) return { kind: 'cancelled' };
      if (!result.filePath || !path.isAbsolute(result.filePath)) throw new AppError('error.exportAbsolute');
      const filePath = path.resolve(result.filePath);
      // Resolve directory links as well as an existing file link before checking application data.
      const appDirectory = await this.files.realpath(this.store.directory);
      const parent = await this.files.realpath(path.dirname(filePath));
      let destination = path.join(parent, path.basename(filePath));
      try { destination = await this.files.realpath(filePath); }
      catch (error) { if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')) throw error; }
      const normalize = (value: string) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
      const inside = (value: string) => {
        const relative = path.relative(normalize(appDirectory), normalize(value));
        return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
      };
      if (inside(destination) || inside(path.join(parent, path.basename(filePath)))) {
        throw new AppError('error.exportProtected');
      }
      try { await this.files.writeFile(filePath, text, 'utf8'); }
      catch { throw new AppError('error.exportWrite'); }
      return { kind: 'saved', filePath };
    });
  }
}
