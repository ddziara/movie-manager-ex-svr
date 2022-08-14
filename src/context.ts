import { MoviesDataSource } from "./datasources/movies-data-source";

export interface IDataSources<TContext = unknown> {
  moviesDataSource: MoviesDataSource<TContext>;
}

export interface IContext {
  dataSources: IDataSources;
}
