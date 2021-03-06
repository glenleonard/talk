import Tab from './containers/Tab';
import Tag from './components/Tag';
import Button from './components/Button';
import TabPane from './containers/TabPane';
import translations from './translations.yml';
import update from 'immutability-helper';
import reducer from './reducer';

import {findCommentInEmbedQuery} from 'coral-embed-stream/src/graphql/utils';
import {insertCommentsSorted} from 'plugin-api/beta/client/utils';

export default {
  reducer,
  translations,
  slots: {
    streamTabs: [Tab],
    streamTabPanes: [TabPane],
    commentInfoBar: [Tag],
    commentReactions: [Button]
  },
  mutations: {
    IgnoreUser: ({variables}) => ({
      updateQueries: {
        CoralEmbedStream_Embed: (previous) => {
          const ignoredUserId = variables.id;
          const newNodes = previous.asset.featuredComments.nodes.filter((n) => n.user.id !== ignoredUserId);
          const removedCount =  previous.asset.featuredComments.nodes.length - newNodes.length;
          const updated = update(previous, {
            asset: {
              featuredComments: {
                nodes: {$set: newNodes}
              },
              featuredCommentsCount: {
                $apply: (value) => value - removedCount,
              }
            }
          });
          return updated;
        }
      }
    }),
    AddTag: ({variables}) => ({
      updateQueries: {
        CoralEmbedStream_Embed: (previous) => {

          if (variables.name !== 'FEATURED') {
            return;
          }

          const comment = findCommentInEmbedQuery(previous, variables.id);

          const updated = update(previous, {
            asset: {
              featuredComments: {
                nodes: {
                  $apply: (nodes) => insertCommentsSorted(nodes, comment, 'REVERSE_CHRONOLOGICAL')
                }
              },
              featuredCommentsCount: {
                $apply: (value) => value + 1
              }
            }
          });

          return updated;
        },
      }
    }),
    RemoveTag: ({variables}) => ({
      updateQueries: {
        CoralEmbedStream_Embed: (previous) => {

          if (variables.name !== 'FEATURED') {
            return;
          }

          const updated = update(previous, {
            asset: {
              featuredComments: {
                nodes: {
                  $apply: (nodes) =>
                    nodes.filter((n) => n.id !== variables.id)
                }
              },
              featuredCommentsCount: {
                $apply: (value) => value - 1
              }
            }
          });

          return updated;
        },
      }
    })
  },
};
