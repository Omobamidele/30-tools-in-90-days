import Link from "next/link";
export default function NotFound() {
  return <div className="p-10 text-[13px]"><p className="font-medium">Page not found</p><Link className="text-brand hover:underline" href="/today">Go to Today</Link></div>;
}
