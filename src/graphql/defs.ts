import { gql } from "apollo-server-core";
import connectionDefs, { buildConnectionEdgeTypes } from "./connection-defs"

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
    movieGroups: MovieGroupsConnection!
  }

  type PositionedMovie {
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
    movieGroups: MovieGroupsConnection!
    listOrder: Int!
  }

  type GroupType {
    _id: ID!
    name: String!
    description: String
    movieGroups: GroupTypesConnection!
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
    movies: PositionedMoviesConnection!
  }

  ${buildConnectionEdgeTypes("Movies", "Movie", "Movie")}
  ${buildConnectionEdgeTypes("MovieGroups", "MovieGroup", "MovieGroup")}
  ${buildConnectionEdgeTypes("GroupTypes", "GroupType", "GroupType")}
  ${buildConnectionEdgeTypes("PositionedMovies", "PositionedMovie", "PositionedMovie")}
 
  type Query {
    movies(first: Int, after: String, last: Int, before: String, offset: Int): MoviesConnection!
    movie(_id: ID!): Movie
    movieGroups(first: Int, after: String, last: Int, before: String, offset: Int): MovieGroupsConnection!
    movieGroup(_id: ID!): MovieGroup
    groupTypes(first: Int, after: String, last: Int, before: String, offset: Int): GroupTypesConnection!
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

  input GroupTypeInfoInput {
    name: String
    description: String
  }
  
  type Mutation {
    # movies
    addMovie(mediaFullPath: String!, gid: ID, listOrder: Int, movieInfo: MovieInfoInput!): ID!
    updateMovie(_id: ID!, movieInfo: MovieInfoInput!): Boolean!
    deleteMovie(_id: ID!): Boolean!
    # movie groups
    addMovieGroup(tid: ID, movieGroupInfo: MovieGroupInfoInput!): ID!
    updateMovieGroup(_id: ID!, movieGroupInfo: MovieGroupInfoInput!): Boolean!
    deleteMovieGroup(_id: ID!): Boolean!
    # group types
    addGroupType(groupTypeInfo: GroupTypeInfoInput!): ID!
    updateGroupType(_id: ID!, groupTypeInfo: GroupTypeInfoInput!): Boolean!
    deleteGroupType(_id: ID!): Boolean!
    # movie groups & movies
    associateMovieAndMovieGroup(_mid: ID!, _gid: ID!, listOrder: Int): Boolean!
    unassociateMovieAndMovieGroup(_mid: ID!, _gid: ID!): Boolean!
    # group types & movie groups
    moveMovieGroup2Type(_gid: ID!, _tid: ID!): Boolean!
    removeMovieGroupFromType(_gid: ID!): Boolean!
  }
`;

