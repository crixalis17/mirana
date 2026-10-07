import {createClient, type Client, type InValue, type ResultSet} from '@libsql/client';

let client: Client | undefined;
export function databaseClient(): Client {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL || (process.env.NODE_ENV !== 'production' ? 'file:./mirana.local.db' : '');
    if (!url) throw new Error('Set TURSO_DATABASE_URL and run the database migration.');
    if (process.env.NODE_ENV === 'production' && (!/^(libsql|https):\/\//.test(url) || !process.env.TURSO_AUTH_TOKEN)) {
      throw new Error('Production requires a hosted Turso database and TURSO_AUTH_TOKEN.');
    }
    client = createClient({url, authToken: process.env.TURSO_AUTH_TOKEN});
  }
  return client;
}
function result(set: ResultSet) {
  return {results: set.rows.map(row => Object.fromEntries(Object.entries(row))), meta: {changes: set.rowsAffected}, success: true};
}
class Statement {
  constructor(readonly sql: string, readonly args: InValue[] = []) {}
  bind(...args: unknown[]) {return new Statement(this.sql, args.map(v => v === undefined ? null : typeof v === 'boolean' ? Number(v) : v) as InValue[]);}
  async first() {return (await this.all()).results[0] || null;}
  async all() {return result(await databaseClient().execute({sql: this.sql, args: this.args}));}
  async run() {return this.all();}
}
export const database = {
  prepare(sql: string) {return new Statement(sql);},
  // libSQL batch executes in one write transaction; observation guards and report writes remain atomic.
  async batch(statements: Statement[]) {return (await databaseClient().batch(statements.map(s => ({sql:s.sql,args:s.args})), 'write')).map(result);},
};
