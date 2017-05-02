const expect = require('chai').expect;
const {graphql} = require('graphql');

const schema = require('../../../../graph/schema');
const Context = require('../../../../graph/context');
const UsersService = require('../../../../services/users');
const AssetModel = require('../../../../models/asset');
const SettingsService = require('../../../../services/settings');
const CommentsService = require('../../../../services/comments');

describe('graph.mutations.editComment', () => {
  let asset;
  let user;
  let settings;
  beforeEach(async () => {
    settings = await SettingsService.init();
    asset = await AssetModel.create({});
    user = await UsersService.createLocalUser(
      'usernameA@example.com', 'password', 'usernameA');
  });
  afterEach(async () => {
    await asset.remove();
    await user.remove();
    await settings.remove();
  });

  const editCommentMutation = `
    mutation EditComment ($id: ID!, $edit: EditCommentInput) {
      editComment(id:$id, edit:$edit) {
        errors {
          translation_key
        }
      }
    }
  `;

  it('a user can edit their own comment', async () => {
    const context = new Context({user});
    const testStartedAt = new Date();
    const comment = await CommentsService.publicCreate({
      asset_id: asset.id,
      author_id: user.id,
      body: `hello there! ${  String(Math.random()).slice(2)}`,
    });

    // body_history should be there
    expect(comment.body_history.length).to.equal(1);
    expect(comment.body_history[0].body).to.equal(comment.body);
    expect(comment.body_history[0].created_at).to.be.instanceOf(Date);
    expect(comment.body_history[0].created_at).to.be.at.least(testStartedAt);

    // now edit
    const newBody = 'I have been edited.';
    const response = await graphql(schema, editCommentMutation, {}, context, {
      id: comment.id,
      edit: {
        body: newBody
      }
    });
    if (response.errors && response.errors.length) {
      console.error(response.errors);
    }
    expect(response.errors).to.be.empty;

    // assert body has changed
    const commentAfterEdit = await CommentsService.findById(comment.id);
    expect(commentAfterEdit.body).to.equal(newBody);
    expect(commentAfterEdit.body_history).to.be.instanceOf(Array);
    expect(commentAfterEdit.body_history.length).to.equal(2);
    expect(commentAfterEdit.body_history[1].body).to.equal(newBody);
    expect(commentAfterEdit.body_history[1].created_at).to.be.instanceOf(Date);
    expect(commentAfterEdit.body_history[1].created_at).to.be.at.least(testStartedAt);
    expect(commentAfterEdit.status).to.equal('NONE');
  });

  const bannedWord = 'BANNED_WORD';
  [
    {
      description: 'premod: editing a REJECTED comment sets back to PREMOD',
      settings: {
        moderation: 'PRE',
      },
      beforeEdit: {
        body: 'I was offensive and thus REJECTED',
        status: 'REJECTED',
      },
      edit: {
        body: 'I have been edited to be less offensive',
      },
      afterEdit: {
        status: 'PREMOD',
      },
    },
    {
      description: 'editing an ACCEPTED comment to add a bad word sets status to REJECTED',
      settings: {
        moderation: 'POST',
        wordlist: {
          banned: [bannedWord]
        }
      },
      beforeEdit: {
        body: 'I\'m a perfectly acceptable comment',
        status: 'ACCEPTED',
      },
      edit: {
        body: `I have been sneakily edited to add a banned word: ${bannedWord}`
      },
      afterEdit: {
        status: 'REJECTED',
      },
    },
    {
      description: 'postmod: editing a REJECTED comment with banned word to remove banned word sets status to NONE',
      settings: {
        moderation: 'POST',
        wordlist: {
          banned: [bannedWord]
        }
      },
      beforeEdit: {
        body: `I'm a rejected comment with bad word ${bannedWord}`,
        status: 'REJECTED',
      },
      edit: {
        body: 'I have been edited to remove the bad word'
      },
      afterEdit: {
        status: 'NONE',
      },
    },
    {
      description: 'postmod + premodLinksEnable: editing an ACCEPTED comment to add a link sets status to PREMOD',
      settings: {
        moderation: 'POST',
        premodLinksEnable: true,
      },
      beforeEdit: {
        body: 'I\'m a perfectly acceptable comment',
        status: 'ACCEPTED',
      },
      edit: {
        body: 'I have been edited to add a link: https://coralproject.net/'
      },
      afterEdit: {
        status: 'PREMOD',
      },
    },
  ].forEach(({description, settings, beforeEdit, edit, afterEdit, only}) => {
    const test = only ? it.only : it;
    test(description, async () => {
      await SettingsService.update(settings);
      const context = new Context({user});
      const comment = await CommentsService.publicCreate(Object.assign(
        {
          asset_id: asset.id,
          author_id: user.id,
        },
        beforeEdit,
      ));

      // now edit
      const newBody = edit.body;
      const response = await graphql(schema, editCommentMutation, {}, context, {
        id: comment.id,
        edit: {
          body: newBody
        }
      });
      if (response.errors && response.errors.length) {console.error(response.errors);}
      expect(response.errors).to.be.empty;
      const commentAfterEdit = await CommentsService.findById(comment.id);
      expect(commentAfterEdit.body).to.equal(newBody);
      expect(commentAfterEdit.status).to.equal(afterEdit.status);      
    });
  });

  /**
  Server: When an Edit is sent to the server
  -- The (old) comment.body and (current) timestamp are pushed onto the comment.body_history array.
  -- The status is set to the same status as if the comment is posted for the first time.*
  -- The body of the comment is updated.
  */
  // user can't edit outside of edit window
  // can't edit comment id that doesn't exist
  // user cant edit comments by others

  // should BANNED users be able to edit their comments?

});
