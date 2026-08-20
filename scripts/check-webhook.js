const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const order = await prisma.orden.findFirst({ 
    where: { shopify_order_number: 9005 }, 
    include: { items: true } 
  });
  console.log(JSON.stringify(order, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
