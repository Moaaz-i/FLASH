/**
 * FLASH Synthetic Data Generator & Stress Tool (FlashFaker)
 * Generates realistic encrypted document datasets for load testing and benchmarks.
 */
export class FlashFaker {
  static FIRST_NAMES = ['Alex', 'Emma', 'Liam', 'Sophia', 'Noah', 'Olivia', 'Ethan', 'Ava', 'Lucas', 'Mia'];
  static LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson', 'Taylor'];
  static DOMAINS = ['gmail.com', 'outlook.com', 'icloud.com', 'flashdb.cloud', 'enterprise.io'];
  static ROLES = ['admin', 'developer', 'manager', 'analyst', 'designer', 'operator'];

  /**
   * Generates a single mock user document
   */
  static mockUser(id = 1) {
    const first = FlashFaker.FIRST_NAMES[Math.floor(Math.random() * FlashFaker.FIRST_NAMES.length)];
    const last = FlashFaker.LAST_NAMES[Math.floor(Math.random() * FlashFaker.LAST_NAMES.length)];
    const domain = FlashFaker.DOMAINS[Math.floor(Math.random() * FlashFaker.DOMAINS.length)];
    const role = FlashFaker.ROLES[Math.floor(Math.random() * FlashFaker.ROLES.length)];

    return {
      _id: `user_${id}`,
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${id}@${domain}`,
      role,
      balance: Math.floor(Math.random() * 50000) + 100,
      isActive: Math.random() > 0.1,
      createdAt: new Date(Date.now() - Math.floor(Math.random() * 1000000000)).toISOString()
    };
  }

  /**
   * Generates a batch of mock documents
   * @param {number} count
   */
  static generateBatch(count = 100) {
    const batch = [];
    for (let i = 1; i <= count; i++) {
      batch.push(FlashFaker.mockUser(i));
    }
    return batch;
  }
}
