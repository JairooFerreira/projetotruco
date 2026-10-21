/**
 * Ledger de partidas dobradas. Base da carteira futura.
 * NÃO movimenta dinheiro real: nenhuma rota expõe depósito ou saque.
 * Regras: cada lançamento soma zero; saldos de usuários nunca ficam negativos;
 * a mesma chave de idempotência não é aplicada duas vezes.
 */

export interface Entry {
  readonly account: string;
  /** Valor em centavos. Positivo: crédito na conta; negativo: débito. */
  readonly amount: bigint;
}

export interface Posting {
  readonly key: string;
  readonly description: string;
  readonly entries: readonly Entry[];
  readonly at: number;
}

export class LedgerError extends Error {}

/** Contas externas (ex.: pagamentos pendentes) podem ficar negativas; contas de usuário não. */
function isUserAccount(account: string): boolean {
  return account.startsWith('user:');
}

export class Ledger {
  private readonly balances = new Map<string, bigint>();
  private readonly postings: Posting[] = [];
  private readonly keys = new Set<string>();

  constructor(private readonly now: () => number = Date.now) {}

  balance(account: string): bigint {
    return this.balances.get(account) ?? 0n;
  }

  history(account: string): Posting[] {
    return this.postings.filter((p) => p.entries.some((e) => e.account === account));
  }

  /**
   * Registra um lançamento. Retorna false se a chave já foi aplicada (idempotente).
   */
  post(key: string, description: string, entries: readonly Entry[]): boolean {
    if (!key) throw new LedgerError('Chave de idempotência obrigatória');
    if (entries.length < 2) throw new LedgerError('Lançamento precisa de pelo menos duas pernas');
    const sum = entries.reduce((acc, e) => acc + e.amount, 0n);
    if (sum !== 0n) throw new LedgerError('Lançamento não soma zero');
    if (entries.some((e) => e.amount === 0n)) throw new LedgerError('Perna com valor zero');
    if (this.keys.has(key)) return false;

    // Simula antes de aplicar: nenhuma mudança parcial.
    const next = new Map<string, bigint>();
    for (const e of entries) {
      next.set(e.account, (next.get(e.account) ?? this.balance(e.account)) + e.amount);
    }
    for (const [account, value] of next) {
      if (isUserAccount(account) && value < 0n) {
        throw new LedgerError(`Saldo insuficiente em ${account}`);
      }
    }

    for (const [account, value] of next) this.balances.set(account, value);
    this.keys.add(key);
    this.postings.push({ key, description, entries: [...entries], at: this.now() });
    return true;
  }
}
