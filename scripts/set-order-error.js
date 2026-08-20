const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.orden.update({
    where: { shopify_order_id: '5555000000005' },
    data: { billing_status: 'error', erp_doc_ref: null, erp_numero: null }
  });
  console.log("Orden 9005 marcada como 'error' para simular fallo y permitir reprocesamiento.");
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
