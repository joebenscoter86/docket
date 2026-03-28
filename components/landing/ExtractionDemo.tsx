export default function ExtractionDemo() {
  return (
    <section className="bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-8">
        <div className="text-center mb-16">
          <h2 className="font-headings text-4xl font-extrabold tracking-tight text-[#0F172A] sm:text-5xl">
            See What Dockett Extracts
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-[#475569]">
            AI reads your invoices and pulls out every detail with high accuracy.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Invoice Mockup */}
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 sm:p-8 shadow-soft">
            <div className="flex justify-between items-start mb-8">
              <div>
                <div className="text-lg font-bold text-[#0F172A] font-headings">Precision Supply Co.</div>
                <div className="text-xs text-[#94A3B8] mt-1">789 Industrial Blvd<br />Austin, TX 78701</div>
              </div>
              <div className="text-right">
                <div className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">Invoice</div>
                <div className="text-sm font-bold text-[#0F172A] mt-1 font-mono">#INV-2026-0847</div>
              </div>
            </div>

            <div className="flex gap-8 mb-8 text-xs">
              <div>
                <div className="font-semibold text-[#94A3B8] uppercase tracking-wider">Bill To</div>
                <div className="mt-1 text-[#0F172A] font-medium">Acme Corporation</div>
                <div className="text-[#64748B]">456 Business Ave<br />New York, NY 10001</div>
              </div>
              <div>
                <div className="font-semibold text-[#94A3B8] uppercase tracking-wider">Invoice Date</div>
                <div className="mt-1 text-[#0F172A] font-medium">Mar 15, 2026</div>
                <div className="font-semibold text-[#94A3B8] uppercase tracking-wider mt-3">Due Date</div>
                <div className="mt-1 text-[#0F172A] font-medium">Apr 14, 2026</div>
              </div>
            </div>

            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 font-semibold text-[#94A3B8] uppercase tracking-wider">Description</th>
                  <th className="text-right py-2 font-semibold text-[#94A3B8] uppercase tracking-wider">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="py-3 text-[#0F172A]">Office Supplies - Q1 Order</td>
                  <td className="py-3 text-right text-[#0F172A] font-medium font-mono">$1,250.00</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-3 text-[#0F172A]">Shipping &amp; Handling</td>
                  <td className="py-3 text-right text-[#0F172A] font-medium font-mono">$85.00</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-3 text-[#0F172A]">Rush Delivery Fee</td>
                  <td className="py-3 text-right text-[#0F172A] font-medium font-mono">$45.00</td>
                </tr>
              </tbody>
            </table>

            <div className="mt-4 flex justify-end">
              <div className="text-right">
                <div className="flex justify-between gap-8 text-xs text-[#64748B]">
                  <span>Subtotal</span>
                  <span className="font-medium text-[#0F172A] font-mono">$1,380.00</span>
                </div>
                <div className="flex justify-between gap-8 text-xs text-[#64748B] mt-1">
                  <span>Tax (8.25%)</span>
                  <span className="font-medium text-[#0F172A] font-mono">$113.85</span>
                </div>
                <div className="flex justify-between gap-8 text-sm font-bold text-[#0F172A] mt-2 pt-2 border-t border-gray-200">
                  <span>Total Due</span>
                  <span className="font-mono">$1,493.85</span>
                </div>
              </div>
            </div>

            <div className="mt-6 p-3 bg-[#F8FAFC] rounded-xl text-xs text-[#64748B]">
              <span className="font-semibold text-[#94A3B8]">Payment Terms:</span>{' '}
              Net 30 days. ACH or wire transfer accepted.
            </div>
          </div>

          {/* Extracted Data Card */}
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 sm:p-8 shadow-soft">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-2 h-2 rounded-full bg-[#10B981]" />
              <span className="text-sm font-semibold text-[#0F172A]">Extracted Data</span>
              <span className="ml-auto text-xs font-medium text-[#10B981] bg-[#10B981]/10 px-2.5 py-1 rounded-full">
                High Confidence
              </span>
            </div>

            <div className="space-y-5">
              <div>
                <div className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">Invoice Number</div>
                <div className="mt-1 text-base font-bold text-[#0F172A] font-mono">INV-2026-0847</div>
              </div>

              <div>
                <div className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">Vendor</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-base font-bold text-[#0F172A]">Precision Supply Co.</span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full ring-1 ring-violet-200">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
                    AI Matched
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">Amount Due</div>
                  <div className="mt-1 text-2xl font-extrabold text-[#0F172A] font-headings">$1,493.85</div>
                  <div className="text-xs text-[#64748B]">USD</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">Due Date</div>
                  <div className="mt-1 text-base font-bold text-[#0F172A]">April 14, 2026</div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-3">Line Items</div>
                <div className="space-y-2">
                  <div className="rounded-xl bg-[#F8FAFC] py-2.5 px-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-[#0F172A]">Office Supplies - Q1 Order</span>
                      <span className="text-sm font-semibold text-[#0F172A] font-mono">$1,250.00</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full ring-1 ring-violet-200">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
                        AI
                      </span>
                      <span className="text-xs text-[#64748B]">Office Supplies &amp; Materials</span>
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#F8FAFC] py-2.5 px-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-[#0F172A]">Shipping &amp; Handling</span>
                      <span className="text-sm font-semibold text-[#0F172A] font-mono">$85.00</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full ring-1 ring-violet-200">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
                        AI
                      </span>
                      <span className="text-xs text-[#64748B]">Freight &amp; Delivery</span>
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#F8FAFC] py-2.5 px-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-[#0F172A]">Rush Delivery Fee</span>
                      <span className="text-sm font-semibold text-[#0F172A] font-mono">$45.00</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full ring-1 ring-violet-200">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
                        AI
                      </span>
                      <span className="text-xs text-[#64748B]">Freight &amp; Delivery</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <div className="flex items-center gap-2 text-sm text-[#10B981]">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium">Ready to review and sync</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
