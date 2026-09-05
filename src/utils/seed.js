require('dotenv').config();
const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');

const Product = require('../models/Product');
const Category = require('../models/Category');
const DeliveryBoy = require('../models/DeliveryBoy');
const User = require('../models/User');
const Order = require('../models/Order');
const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const Staff = require('../models/Staff');
const Coupon = require('../models/Coupon');
const Banner = require('../models/Banner');
const Zone = require('../models/Zone');

async function run() {
  await connectDB();
  console.log('[seed] clearing existing collections...');
  await Promise.all([
    Product.deleteMany({}), Category.deleteMany({}), DeliveryBoy.deleteMany({}),
    User.deleteMany({}), Order.deleteMany({}), Plan.deleteMany({}),
    Subscription.deleteMany({}), Staff.deleteMany({}), Coupon.deleteMany({}),
    Banner.deleteMany({}), Zone.deleteMany({})
  ]);

  console.log('[seed] categories...');
  await Category.insertMany([
    { key: 'milk', label: 'Milk', sortOrder: 1 },
    { key: 'curd', label: 'Curd & Paneer', sortOrder: 2 },
    { key: 'ghee', label: 'Ghee & Butter', sortOrder: 3 },
    { key: 'bread', label: 'Bread & Eggs', sortOrder: 4 }
  ]);

  console.log('[seed] products...');
  const products = await Product.insertMany([
    { name: 'Full Cream Milk', unit: '500ml', category: 'milk', price: 32, mrp: 36, stock: 8, desc: 'Farm fresh full cream milk, pasteurized daily.', available: true, featured: true, sold: 412 },
    { name: 'Toned Milk', unit: '1L', category: 'milk', price: 54, mrp: 58, stock: 120, desc: 'Toned milk, low fat, high protein.', available: true, featured: true, sold: 389 },
    { name: 'Fresh Curd', unit: '400g', category: 'curd', price: 40, mrp: 44, stock: 0, desc: 'Thick, creamy curd made fresh every morning.', available: true, featured: false, sold: 201 },
    { name: 'Paneer', unit: '200g', category: 'curd', price: 80, mrp: 90, stock: 35, desc: 'Soft paneer cubes, made from full cream milk.', available: true, featured: false, sold: 156 },
    { name: 'Pure Ghee', unit: '500ml', category: 'ghee', price: 320, mrp: 350, stock: 22, desc: 'Traditional bilona-method cow ghee.', available: true, featured: true, sold: 98 },
    { name: 'Table Butter', unit: '100g', category: 'ghee', price: 52, mrp: 56, stock: 60, desc: 'Creamy salted butter.', available: false, featured: false, sold: 64 },
    { name: 'Brown Bread', unit: '400g', category: 'bread', price: 45, mrp: 48, stock: 14, desc: 'Whole wheat brown bread, baked fresh.', available: true, featured: false, sold: 77 },
    { name: 'Farm Eggs', unit: '6 pcs', category: 'bread', price: 60, mrp: 65, stock: 9, desc: 'Free-range farm eggs.', available: true, featured: false, sold: 143 }
  ]);

  console.log('[seed] delivery boys...');
  const dbPassword = await bcrypt.hash('delivery123', 10);
  const [d1, d2, d3, d4, d5, d6, d7] = await DeliveryBoy.insertMany([
    { name: 'Rajesh Kumar', phone: '+919876543210', area: 'Kittu Nagar', status: 'pending', vehicle: 'Bike - MH12 AB 1234' },
    { name: 'Suresh Yadav', phone: '+919876511122', area: 'Model Town', status: 'pending', vehicle: 'Bike - MH12 CD 5678' },
    { name: 'Amit Sharma', phone: '+919876533445', area: 'Civil Lines', status: 'pending', vehicle: 'Bicycle' },
    { name: 'Vikram Singh', phone: '+919123455667', area: 'Kittu Nagar', status: 'approved', deliveries: 842, rating: 4.8, vehicle: 'Bike - MH12 EF 9012', passwordHash: dbPassword },
    { name: 'Manoj Verma', phone: '+919123477889', area: 'Sadar Bazaar', status: 'approved', deliveries: 1204, rating: 4.6, vehicle: 'Bike - MH12 GH 3456', passwordHash: dbPassword },
    { name: 'Deepak Rao', phone: '+919123499001', area: 'Model Town', status: 'suspended', deliveries: 390, rating: 3.2, vehicle: 'Bike - MH12 IJ 7890', passwordHash: dbPassword },
    { name: 'Sanjay Patil', phone: '+919123422334', area: 'Civil Lines', status: 'rejected', vehicle: 'Bike - MH12 KL 2345' }
  ]);

  console.log('[seed] users...');
  const [u1, u2, u3, u4, u5, u6] = await User.insertMany([
    { name: 'Neha Joshi', phone: '+919000011111', status: 'active', ordersCount: 42 },
    { name: 'Rohit Mehra', phone: '+919000022222', status: 'active', ordersCount: 18 },
    { name: 'Kavita Rao', phone: '+919000033333', status: 'new', ordersCount: 1 },
    { name: 'Arjun Das', phone: '+919000044444', status: 'active', ordersCount: 96 },
    { name: 'Priya Nair', phone: '+919000055555', status: 'new', ordersCount: 2 },
    { name: 'Sanya Kapoor', phone: '+919000066666', status: 'blocked', ordersCount: 5 }
  ]);

  console.log('[seed] orders...');
  await Order.insertMany([
    { orderCode: 'PD1042', customer: u1._id, customerName: 'Neha Joshi', phone: u1.phone, address: 'B-204, Kittu Nagar', items: [{ name: 'Full Cream Milk 500ml', qty: 2, price: 32 }, { name: 'Fresh Curd 400g', qty: 1, price: 40 }], total: 104, status: 'placed' },
    { orderCode: 'PD1041', customer: u2._id, customerName: 'Rohit Mehra', phone: u2.phone, address: '12, Model Town', items: [{ name: 'Toned Milk 1L', qty: 1, price: 54 }, { name: 'Paneer 200g', qty: 1, price: 80 }], total: 134, status: 'preparing' },
    { orderCode: 'PD1040', customer: u3._id, customerName: 'Kavita Rao', phone: u3.phone, address: '45, Sadar Bazaar', items: [{ name: 'Pure Ghee 500ml', qty: 1, price: 320 }], total: 320, status: 'out', assigned: d4._id },
    { orderCode: 'PD1039', customer: u4._id, customerName: 'Arjun Das', phone: u4.phone, address: '7, Civil Lines', items: [{ name: 'Farm Eggs 6pcs', qty: 2, price: 60 }, { name: 'Brown Bread 400g', qty: 1, price: 45 }], total: 165, status: 'delivered', assigned: d5._id },
    { orderCode: 'PD1038', customer: u5._id, customerName: 'Priya Nair', phone: u5.phone, address: 'B-204, Kittu Nagar', items: [{ name: 'Full Cream Milk 500ml', qty: 4, price: 32 }], total: 128, status: 'delivered', assigned: d4._id },
    { orderCode: 'PD1037', customer: u6._id, customerName: 'Sanya Kapoor', phone: u6.phone, address: '21, Model Town', items: [{ name: 'Table Butter 100g', qty: 1, price: 52 }], total: 52, status: 'cancelled' }
  ]);

  console.log('[seed] plans & subscriptions...');
  const [pl1, pl2, pl3, pl4] = await Plan.insertMany([
    { name: 'Weekly Starter', duration: 'weekly', qty: 'one', slot: 'morning', price: 378, subs: 24 },
    { name: 'Monthly Regular', duration: 'monthly', qty: 'one', slot: 'morning', price: 1560, subs: 186 },
    { name: 'Monthly Family Pack', duration: 'monthly', qty: 'two', slot: 'morning', price: 3060, subs: 94 },
    { name: 'Half Litre Evening', duration: 'weekly', qty: 'half', slot: 'evening', price: 196, subs: 31 }
  ]);
  await Plan.create({ name: '6 Month Saver', duration: 'sixmonth', qty: 'one', slot: 'morning', price: 9000, subs: 58 });

  await Subscription.insertMany([
    { customer: u1._id, address: 'B-204, Kittu Nagar', plan: pl2._id, slot: 'morning', startDate: new Date('2026-08-01'), active: true },
    { customer: u2._id, address: '12, Model Town', plan: pl3._id, slot: 'morning', startDate: new Date('2026-08-05'), active: true },
    { customer: u3._id, address: '45, Sadar Bazaar', custom: { mon: 'one', tue: 'half', wed: 'one', thu: 'half', fri: 'one', sat: 'two', sun: 'none' }, slot: 'evening', startDate: new Date('2026-08-10'), active: true },
    { customer: u4._id, address: '7, Civil Lines', plan: pl1._id, slot: 'morning', startDate: new Date('2026-08-24'), active: true },
    { customer: u5._id, address: 'B-204, Kittu Nagar', plan: pl4._id, slot: 'evening', startDate: new Date('2026-08-15'), active: true }
  ]);

  console.log('[seed] staff (admin login)...');
  const staffPassword = await bcrypt.hash('admin123', 10);
  await Staff.create({ name: 'Owner', email: 'admin@milk.com', passwordHash: staffPassword, role: 'owner' });

  console.log('[seed] coupons, banners, zones...');
  await Coupon.create({ code: 'WELCOME50', type: 'flat', value: 50, minOrder: 200, expiry: new Date('2026-12-31') });
  await Banner.create({ title: 'Fresh Milk, Delivered Daily', sortOrder: 1 });
  await Zone.insertMany([
    { name: 'North Zone', areas: ['Kittu Nagar', 'Model Town'] },
    { name: 'South Zone', areas: ['Civil Lines', 'Sadar Bazaar'] }
  ]);

  console.log('[seed] done.');
  console.log('  Admin login   -> email: admin@milk.com / password: admin123');
  console.log('  Delivery login-> phone: +919123455667 / password: delivery123 (Vikram Singh, approved)');
  console.log('  Customer OTP  -> any phone, OTP dev mode accepts "0000"');
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
