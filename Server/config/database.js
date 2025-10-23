import sequelize from './config/sequelize.js';

export async function connectDB({ syncModels = false } = {}) {
  try {
    await sequelize.authenticate();
    console.log('MySQL connected');

    if (syncModels) {
      // Chỉ dùng sync({ alter: true }) hoặc force ở dev. Không dùng force trên prod.
      await sequelize.sync({ alter: true });
      console.log('Models synced (alter:true)');
    }
  } catch (err) {
    console.error('MySQL connection error:', err);
    process.exit(1);
  }
}

export default sequelize;