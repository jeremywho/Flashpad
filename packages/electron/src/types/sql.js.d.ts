declare module 'sql.js' {
  export interface SqlJsStatic {
    Database: typeof Database;
  }

  export interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  export interface ParamsObject {
    [key: string]: any;
  }

  export interface ParamsCallback {
    (obj: ParamsObject): void;
  }

  export interface Database {
    run(sql: string, params?: ParamsObject | any[]): Database;
    exec(sql: string, params?: ParamsObject | any[]): QueryExecResult[];
    each(sql: string, params: ParamsObject | any[], callback: ParamsCallback, done: () => void): Database;
    each(sql: string, callback: ParamsCallback, done: () => void): Database;
    prepare(sql: string, params?: ParamsObject | any[]): Statement;
    export(): Uint8Array;
    close(): void;
    getRowsModified(): number;
    create_function(name: string, func: (...args: any[]) => any): Database;
  }

  export interface Statement {
    bind(params?: ParamsObject | any[]): boolean;
    step(): boolean;
    getAsObject(params?: ParamsObject | any[]): ParamsObject;
    getColumnNames(): string[];
    get(params?: ParamsObject | any[]): any[];
    run(params?: ParamsObject | any[]): void;
    reset(): void;
    free(): boolean;
  }

  export class Database {
    constructor(data?: ArrayLike<number> | Buffer | null);
  }

  export interface SqlJsConfig {
    locateFile?: (file: string) => string;
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
}
