import { useParams } from 'react-router';

export function ReportPage() {
  const { orderId } = useParams();

  return (
    <main>
      <h1>Report an incident</h1>
      <p>Order {orderId}</p>
    </main>
  );
}
