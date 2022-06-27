export interface IAccessDBData {
    execQuery(sql: string, ...params: any[]): Promise<any[]>;
    execRetID(id: string, sql: string, ...params: any[]): Promise<number>;
    execRetVoid(sql: string, ...params: any[]): Promise<void>;
    getSQLParameter(index: number): string;
}

