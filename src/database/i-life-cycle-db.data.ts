export interface ILifeCycleDBData {
    init(): Promise<ILifeCycleDBData>;
    uninit(): Promise<void>;
}