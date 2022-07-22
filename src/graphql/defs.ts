import { gql } from "apollo-server-core";
import connectionDefs, { buildCoonectionEdgeTypes } from "./connection-defs"

//                                                   
//                  PositionedMovie <----------------- MovieGroup <--------------------- GroupType
//                         |
//                         V   
//                       Movie
//

//======================================================
export const typeDefs = gql`
  enum Visibility {
    INVISIBLE
    VISIBLE
  }

  type BigInt {
    bigIntStr: String!
  } 

  input BigIntInput {
    bigIntStr: String!
  }

  ${connectionDefs} 

  type Movie {
    _id: ID!
    mediaFullPath: String!
    title: String!
    description: String
    genre: String
    length: BigInt                     
    mediaType: Int!
    mediaDuration: BigInt              
    mediaSize: BigInt!
    mediaRating: Int
    mediaResume: BigInt
    resolutionX: Int
    resolutionY: Int
    aspectRatioX: Int
    aspectRatioY: Int
    thumbnailResolutionX: Int
    thumbnailResolutionY: Int
    playCount: Int!
    stereoType: String!
    infoFilePath: String
    isMovieFolder: Boolean
    visible: Visibility!
    orientation: Int
    onlineInfoVisible: Int!
    releaseDate: String!
    addDate: String!
    modifyDate: String!
    playDate: String!
    studio: String
    protected: Boolean  
    movieGroups: [MovieGroup!]!
  }

  type PositionedMovie {
    movie: Movie!
    listOrder: Int!
  }

  type GroupType {
    _id: ID!
    name: String!
    description: String
    movieGroups: [MovieGroup!]!
  }

  type MovieGroup {
    _id: ID!
    type: Int!
    name: String!
    addDate: String!
    mediaDate: String!
    modifyDate: String!
    place: String
    description: String
    visible: Visibility!
    custom: String
    groupType: GroupType
    movies: [PositionedMovie!]!
  }

  ${buildCoonectionEdgeTypes("Movies", "Movie", "Movie")}
  ${buildCoonectionEdgeTypes("MovieGroups", "MovieGroup", "MovieGroup")}
 
  type Query {
    movies(first: Int, after: String, last: Int, before: String, offset: Int): MoviesConnection!
    movie(_id: ID!): Movie
    movieGroups(first: Int, after: String, last: Int, before: String, offset: Int): MovieGroupsConnection!
    movieGroup(_id: ID!): MovieGroup
    groupTypes(first: Int, after: String, last: Int, before: String, offset: Int): [GroupType!]!
    groupType(_id: ID!): GroupType
  }

  input MovieInfoInput {
    title: String
    description: String
    genre: String
    length: BigIntInput
    mediaType: Int
    mediaDuration: BigIntInput
    mediaSize: BigIntInput
    mediaRating: Int
    mediaResume: BigIntInput
    resolutionX: Int
    resolutionY: Int
    aspectRatioX: Int
    aspectRatioY: Int
    thumbnailResolutionX: Int
    thumbnailResolutionY: Int
    playCount: Int
    stereoType: String
    infoFilePath: String
    isMovieFolder: Boolean
    visible: Visibility
    orientation: Int
    onlineInfoVisible: Int
    releaseDate: String
    addDate: String
    modifyDate: String
    playDate: String
    studio: String
    protected: Boolean  
  } 

  input MovieGroupInfoInput {
    type: Int
    name: String
    addDate: String
    mediaDate: String
    modifyDate: String
    place: String
    description: String
    visible: Visibility
    custom: String
  }

  type Mutation {
    # movies
    addMovie(mediaFullPath: String!, movieInfo: MovieInfoInput!): ID!
    updateMovie(_id: ID!, movieInfo: MovieInfoInput!): Boolean!
    deleteMovie(_id: ID!): Boolean!
    # movie groups
    addMovieGroup(movieGroupInfo: MovieGroupInfoInput!): ID!
    updateMovieGroup(_id: ID!, movieGroupInfo: MovieGroupInfoInput!): Boolean!
    deleteMovieGroup(_id: ID!): Boolean!
  }
`;

