import { RunData } from '../types';
import { Utils } from '../utils';

export class StorageService {
  private static RUNS_KEY = 'neon_god_runs_v1';
  private static STATS_KEY = 'neon_god_stats_v1';

  static async saveRun(runData: RunData): Promise<RunData> {
    try {
      const id = Utils.uid('run');
      const finalRun = { ...runData, id, timestamp: Date.now() };
      
      const runs = await this.getTopRuns(100);
      runs.push(finalRun);
      runs.sort((a, b) => b.score - a.score);
      
      localStorage.setItem(this.RUNS_KEY, JSON.stringify(runs.slice(0, 50))); 
      
      const stats = await this.getStats();
      stats.totalRuns += 1;
      stats.bestScore = Math.max(stats.bestScore, runData.score);
      localStorage.setItem(this.STATS_KEY, JSON.stringify(stats));

      return finalRun;
    } catch (e) {
      console.error("Save failed", e);
      return runData;
    }
  }

  static async getTopRuns(limit = 10): Promise<RunData[]> {
    try {
      const raw = localStorage.getItem(this.RUNS_KEY);
      if (!raw) return [];
      const runs = JSON.parse(raw) as RunData[];
      return runs.slice(0, limit);
    } catch (e) {
      return [];
    }
  }

  static async getStats() {
    try {
      const raw = localStorage.getItem(this.STATS_KEY);
      if (!raw) return { totalRuns: 0, bestScore: 0 };
      return JSON.parse(raw);
    } catch (e) {
      return { totalRuns: 0, bestScore: 0 };
    }
  }
}