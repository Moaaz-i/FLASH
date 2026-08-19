import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { FlashClient, FlashSchemaExtended } from '../src/index.mjs';

test('ODM & Active Record - Models, Pre/Post Hooks, and Virtuals', async (t) => {
  const tmpDir = path.join(os.tmpdir(), `flash_odm_test_${Date.now()}`);
  const client = new FlashClient({
    secretKey: 'master_passphrase_odm_test',
    storagePath: tmpDir
  });

  try {
    // 1. Define Schema with Hooks and Virtuals
    const userSchema = new FlashSchemaExtended({
      firstName: { type: 'string', required: true },
      lastName: { type: 'string', required: true },
      email: { type: 'string', required: true },
      age: { type: 'number', default: 18 }
    });

    let preSaveCalled = false;
    let postSaveCalled = false;

    userSchema.pre('save', function() {
      preSaveCalled = true;
      if (this.firstName) this.firstName = this.firstName.trim();
    });

    userSchema.post('save', function(doc) {
      postSaveCalled = true;
    });

    userSchema.virtual('fullName').get(function() {
      return `${this.firstName} ${this.lastName}`;
    });

    userSchema.methods.sayHello = function() {
      return `Hello, I am ${this.fullName}`;
    };

    // 2. Compile Model
    const User = client.model('User', userSchema);

    // 3. Create active instance and call save()
    const user = new User({
      firstName: '  Ada  ',
      lastName: 'Lovelace',
      email: 'ada@lovelace.org'
    });

    assert.equal(user.fullName, '  Ada   Lovelace', 'Virtual getter should compute before save');

    await user.save();

    assert.equal(preSaveCalled, true, 'Pre-save hook should execute');
    assert.equal(postSaveCalled, true, 'Post-save hook should execute');
    assert.equal(user.firstName, 'Ada', 'Pre-save hook should trim whitespace');
    assert.equal(user.fullName, 'Ada Lovelace', 'Virtual getter should reflect trimmed name');
    assert.equal(user.sayHello(), 'Hello, I am Ada Lovelace', 'Custom instance method should work');
    assert.ok(user._id, 'Saved document should have generated _id');

    // 4. Query through Model static find()
    const foundUser = await User.findById(user._id);
    assert.ok(foundUser);
    assert.equal(foundUser.email, 'ada@lovelace.org');
    assert.equal(foundUser.fullName, 'Ada Lovelace');

    // 5. Update and remove
    foundUser.age = 36;
    await foundUser.save();

    const count = await User.countDocuments();
    assert.equal(count, 1);

    await foundUser.remove();
    const countAfterRemove = await User.countDocuments();
    assert.equal(countAfterRemove, 0);

  } finally {
    await client.close();
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});
