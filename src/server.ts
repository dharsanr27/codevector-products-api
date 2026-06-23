import express from 'express';
import cors from 'cors';
import productsRouter from './routes/products.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.use(cors());

app.use('/', productsRouter);

app.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'CodeVector products API' });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});