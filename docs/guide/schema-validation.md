# Flexible Schema Validation

FLASH DB gives you the best of both worlds: **100% Schema Freedom (Schema-less NoSQL) by default**, with the ability to define **Optional Ergonomic Schema Validation Rules** on specific collections.

---

## Defining a Flexible Schema

You can define rules directly when instantiating a collection:

```javascript
import { FlashClient } from '@moaaz-i/flash-db';

const client = new FlashClient({ secretKey: 'master_key' });

const users = client.collection('users', {
  schema: {
    name: { 
      type: 'string', 
      required: true, 
      min: 2, 
      max: 100 
    },
    email: { 
      type: 'string', 
      required: true, 
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ 
    },
    age: { 
      type: 'number', 
      min: 18, 
      max: 120 
    },
    role: { 
      type: 'string', 
      enum: ['admin', 'editor', 'viewer'], 
      default: 'viewer' 
    },
    isActive: { 
      type: 'boolean', 
      default: true 
    }
  }
});
```

---

## Supported Rule Properties

| Property | Type | Description |
| :--- | :--- | :--- |
| `type` | `'string' \| 'number' \| 'boolean' \| 'array' \| 'object'` | Required data type. |
| `required` | `boolean` | Rejects document if field is missing or empty. |
| `default` | `any \| Function` | Default value or factory function applied if omitted. |
| `min` | `number` | Minimum numerical value or minimum string length. |
| `max` | `number` | Maximum numerical value or maximum string length. |
| `match` | `RegExp` | Regular expression pattern for strings. |
| `enum` | `Array<any>` | Allowed list of values. |
| `validate` | `(value) => boolean \| string` | Custom synchronous validation logic. |
