export function PortlandGuide() {
  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-slate-100">
          Portland Cost of Living Guide
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Based on Feb 2026 data for the Portland, OR metro area
        </p>
      </div>

      {/* Key Facts */}
      <section className="border border-slate-800 rounded-lg p-5 bg-slate-800/40">
        <h2 className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-4">
          Key Facts
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <KeyFact
            label="Portland Metro Minimum Wage"
            value="$16.30/hr"
            note="As of July 2025, adjusts annually"
            href="https://www.oregon.gov/boli/workers/pages/minimum-wage.aspx"
          />
          <KeyFact
            label="MIT Living Wage (1 adult, 0 children)"
            value="$27.91/hr"
            note="Multnomah County, includes car & health insurance"
            href="https://livingwage.mit.edu/counties/41051"
          />
          <KeyFact
            label="Oregon Sales Tax"
            value="None"
            note="Oregon has no state or local sales tax"
          />
          <KeyFact
            label="TriMet Monthly Pass"
            value="$100"
            note="Auto-earned via Hop card after $100 in rides"
            href="https://trimet.org/fares/"
          />
        </div>
      </section>

      {/* Housing Costs */}
      <section className="space-y-4">
        <h2 className="text-xs font-mono text-slate-500 uppercase tracking-wider">
          Housing Costs
        </h2>

        <div className="border border-slate-800 rounded-lg p-5 bg-slate-800/40">
          <h3 className="text-sm font-medium text-slate-200 mb-1">
            Nicer Neighborhoods
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            Sellwood, Alberta Arts, Laurelhurst, Hawthorne, Division, Mississippi
          </p>
          <HousingTable
            rows={[
              { type: "Room (shared house)", rent: "$850 - $1,100" },
              { type: "Studio", rent: "$1,285 - $1,500" },
              { type: "1-bedroom", rent: "$1,500 - $1,750" },
              {
                type: "Median home price",
                rent: "$525K - $900K (varies widely)",
              },
            ]}
          />
        </div>

        <div className="border border-slate-800 rounded-lg p-5 bg-slate-800/40">
          <h3 className="text-sm font-medium text-slate-200 mb-1">
            More Affordable Neighborhoods
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            Brentwood-Darlington, Lents, Foster-Powell, Montavilla, Woodstock,
            Kerns
          </p>
          <HousingTable
            rows={[
              { type: "Room (shared house)", rent: "$650 - $900" },
              { type: "Studio", rent: "$950 - $1,200" },
              { type: "1-bedroom", rent: "$1,100 - $1,400" },
              { type: "Median home price", rent: "$400K - $580K" },
            ]}
          />
        </div>
      </section>

      {/* Monthly Budget Estimates */}
      <section className="border border-slate-800 rounded-lg p-5 bg-slate-800/40">
        <h2 className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-1">
          Monthly Budget Estimates (Single Person, Affordable Area)
        </h2>
        <p className="text-xs text-slate-600 mb-4">
          Complete budget including all typical expenses. "Budget" = frugal but
          sustainable. "Comfortable" = moderate lifestyle with room for
          savings.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-xs font-mono text-slate-500 pb-2 pr-4">
                  Expense
                </th>
                <th className="text-right text-xs font-mono text-slate-500 pb-2 pr-4">
                  Budget
                </th>
                <th className="text-right text-xs font-mono text-slate-500 pb-2">
                  Comfortable
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              <GroupHeader label="Housing (pick one)" />
              <BudgetRow
                label="Room in shared house"
                budget="$700"
                comfortable="$900"
                indent
              />
              <BudgetRow
                label="Studio apartment"
                budget="$1,000"
                comfortable="$1,200"
                indent
              />
              <BudgetRow
                label="1-bedroom apartment"
                budget="$1,200"
                comfortable="$1,400"
                indent
              />
              <GroupHeader label="Bills" />
              <BudgetRow
                label="Utilities (electric, gas, water)"
                budget="$180"
                comfortable="$250"
              />
              <BudgetRow
                label="Internet"
                budget="$55"
                comfortable="$65"
              />
              <BudgetRow
                label="Phone"
                budget="$65"
                comfortable="$80"
              />
              <GroupHeader label="Living" />
              <BudgetRow
                label="Groceries"
                budget="$350"
                comfortable="$420"
              />
              <BudgetRow
                label="Transit (TriMet pass)"
                budget="$100"
                comfortable="$100"
              />
              <BudgetRow
                label="Health insurance *"
                budget="$0"
                comfortable="$0"
              />
              <GroupHeader label="Personal" />
              <BudgetRow
                label="Dining out & entertainment"
                budget="$125"
                comfortable="$250"
              />
              <BudgetRow
                label="Personal care & clothing"
                budget="$100"
                comfortable="$150"
              />
              <BudgetRow
                label="Savings & emergency fund"
                budget="$150"
                comfortable="$300"
              />

              {/* Totals */}
              <BudgetTotalRow
                label="Total w/ room share"
                budget="$1,825"
                comfortable="$2,515"
              />
              <BudgetTotalRow
                label="Total w/ studio"
                budget="$2,125"
                comfortable="$2,815"
              />
              <BudgetTotalRow
                label="Total w/ 1-bedroom"
                budget="$2,325"
                comfortable="$3,015"
              />
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-600 mt-3">
          * Health insurance: $0 if employer-provided (common for full-time
          jobs). If buying marketplace coverage, budget $200-400/month depending
          on income and plan tier.{" "}
          <ExtLink href="https://healthcare.oregon.gov/">Oregon Health Plan</ExtLink>{" "}
          covers individuals earning under ~$20,800/year.
        </p>
      </section>

      {/* Wage Requirements */}
      <section className="border border-slate-800 rounded-lg p-5 bg-slate-800/40">
        <h2 className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-1">
          What Hourly Wage Do You Need?
        </h2>
        <p className="text-xs text-slate-600 mb-4">
          Gross hourly wage needed to cover the complete budget above.
          Assumes 40 hr/week (2,080 hr/year) and ~20% effective tax rate
          (federal + Oregon state + FICA).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-xs font-mono text-slate-500 pb-2 pr-4">
                  Living Situation
                </th>
                <th className="text-right text-xs font-mono text-slate-500 pb-2 pr-4">
                  Budget
                </th>
                <th className="text-right text-xs font-mono text-slate-500 pb-2">
                  Comfortable
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              <WageRow
                label="Room share"
                minimum="~$13.15/hr"
                comfortable="~$18.15/hr"
                annualMin="$27,375"
                annualComf="$37,725"
              />
              <WageRow
                label="Studio"
                minimum="~$15.30/hr"
                comfortable="~$20.30/hr"
                annualMin="$31,875"
                annualComf="$42,225"
              />
              <WageRow
                label="1-bedroom"
                minimum="~$16.75/hr"
                comfortable="~$21.75/hr"
                annualMin="$34,875"
                annualComf="$45,225"
              />
            </tbody>
          </table>
        </div>
        <div className="mt-4 space-y-2 text-[11px] text-slate-600">
          <p>
            <span className="text-slate-500">Formula:</span>{" "}
            (monthly expenses × 12) ÷ (2,080 hours × 0.80 take-home) = gross
            hourly wage needed.
          </p>
          <p>
            <span className="text-slate-500">Portland minimum wage:</span>{" "}
            $16.30/hr ($33,900/year) covers a frugal room-share or studio
            lifestyle. A 1-bedroom at budget tier requires slightly above
            minimum wage.
          </p>
          <p>
            <span className="text-slate-500">MIT Living Wage:</span>{" "}
            $27.91/hr ($58,050/year) — this higher benchmark assumes a car
            ($650/mo transportation), marketplace health insurance, and 1BR
            housing at HUD Fair Market Rent.{" "}
            <ExtLink href="https://livingwage.mit.edu/counties/41051">
              See full breakdown
            </ExtLink>
          </p>
          <p>
            <span className="text-slate-500">Note:</span>{" "}
            If your employer doesn't provide health insurance, add $200-400/month
            to these budgets, which adds roughly $1.50-$3.00/hr to the wage
            requirement.
          </p>
        </div>
      </section>

      {/* Neighborhoods */}
      <section className="space-y-4">
        <h2 className="text-xs font-mono text-slate-500 uppercase tracking-wider">
          Neighborhoods
        </h2>

        <div className="border border-slate-800 rounded-lg p-5 bg-slate-800/40">
          <h3 className="text-sm font-medium text-slate-200 mb-3">
            More Affordable
          </h3>
          <div className="space-y-3">
            <Neighborhood
              name="Brentwood-Darlington"
              description="Diverse, quiet residential area with improving infrastructure. Good access to outer SE Portland."
            />
            <Neighborhood
              name="Lents"
              description="Up-and-coming neighborhood with Green Line MAX access and new development bringing fresh energy."
            />
            <Neighborhood
              name="Foster-Powell"
              description="Walkable strip with independent shops and a growing food scene. Strong community identity."
            />
            <Neighborhood
              name="Montavilla"
              description="Community feel with local shops along SE Stark. Friendly, neighborhood-oriented vibe."
            />
            <Neighborhood
              name="Woodstock"
              description="Charming main street with a mix of vintage and new businesses. Walkable commercial core."
            />
            <Neighborhood
              name="Kerns"
              description="Central, close-in eastside location. Walkable to shops, bars, and restaurants on E Burnside."
            />
          </div>
        </div>

        <div className="border border-slate-800 rounded-lg p-5 bg-slate-800/40">
          <h3 className="text-sm font-medium text-slate-200 mb-3">Nicer</h3>
          <div className="space-y-3">
            <Neighborhood
              name="Sellwood"
              description="Antique shops, riverfront access, and a family-friendly atmosphere in SE Portland."
            />
            <Neighborhood
              name="Alberta Arts District"
              description="Galleries, restaurants, and vibrant street life. One of Portland's most culturally active corridors."
            />
            <Neighborhood
              name="Hawthorne"
              description="Eclectic shops, restaurants, and a classic Portland feel. Long-established bohemian character."
            />
            <Neighborhood
              name="Division"
              description="New development mixed with restaurants and varied residential options. Rapidly evolving."
            />
            <Neighborhood
              name="Laurelhurst"
              description="Tree-lined streets, beautiful park, quiet residential, close to Burnside shops and restaurants."
            />
            <Neighborhood
              name="Mississippi"
              description="Breweries, shops, and music venues packed into a compact, walkable district in North Portland."
            />
          </div>
        </div>
      </section>

      {/* External Resources */}
      <section className="border border-slate-800 rounded-lg p-5 bg-slate-800/40">
        <h2 className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-4">
          External Resources
        </h2>
        <div className="space-y-2 text-sm">
          <ResourceLink
            label="Compare your city to Portland"
            href="https://www.numbeo.com/cost-of-living/in/Portland"
            description="Numbeo cost-of-living data with city comparison tool"
          />
          <ResourceLink
            label="MIT Living Wage Calculator"
            href="https://livingwage.mit.edu/counties/41051"
            description="Detailed expense breakdown for Multnomah County"
          />
          <ResourceLink
            label="PayScale Cost of Living Calculator"
            href="https://www.payscale.com/cost-of-living-calculator/Oregon-Portland"
            description="Compare salary requirements between cities"
          />
          <ResourceLink
            label="RentCafe Cost of Living"
            href="https://www.rentcafe.com/cost-of-living-calculator/us/or/portland/"
            description="Housing-focused comparison with income-based estimates"
          />
          <ResourceLink
            label="Oregon Minimum Wage (BOLI)"
            href="https://www.oregon.gov/boli/workers/pages/minimum-wage.aspx"
            description="Official Oregon minimum wage rates by region"
          />
          <ResourceLink
            label="TriMet Fares"
            href="https://trimet.org/fares/"
            description="Current transit fares and Hop card info"
          />
          <ResourceLink
            label="Oregon Health Plan"
            href="https://healthcare.oregon.gov/"
            description="Free health coverage for qualifying income levels"
          />
        </div>
      </section>
    </div>
  );
}

function KeyFact({
  label,
  value,
  note,
  href,
}: {
  label: string;
  value: string;
  note: string;
  href?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-lg font-mono font-bold text-amber-400">
        {href ? (
          <ExtLink href={href} className="text-amber-400 hover:text-amber-300">
            {value}
          </ExtLink>
        ) : (
          value
        )}
      </span>
      <span className="text-[11px] text-slate-600">{note}</span>
    </div>
  );
}

function HousingTable({ rows }: { rows: { type: string; rent: string }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="text-left text-xs font-mono text-slate-500 pb-2 pr-4">
              Type
            </th>
            <th className="text-right text-xs font-mono text-slate-500 pb-2">
              Monthly Rent
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {rows.map((row) => (
            <tr key={row.type}>
              <td className="py-2 pr-4 text-slate-300">{row.type}</td>
              <td className="py-2 text-right font-mono text-slate-200">
                {row.rent}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupHeader({ label }: { label: string }) {
  return (
    <tr>
      <td
        colSpan={3}
        className="pt-3 pb-1 text-[11px] font-mono text-slate-500 uppercase tracking-wider"
      >
        {label}
      </td>
    </tr>
  );
}

function BudgetRow({
  label,
  budget,
  comfortable,
  indent,
}: {
  label: string;
  budget: string;
  comfortable: string;
  indent?: boolean;
}) {
  return (
    <tr>
      <td className={`py-1.5 pr-4 text-slate-300 ${indent ? "pl-4" : ""}`}>
        {label}
      </td>
      <td className="py-1.5 pr-4 text-right font-mono text-slate-200">
        {budget}
      </td>
      <td className="py-1.5 text-right font-mono text-slate-200">
        {comfortable}
      </td>
    </tr>
  );
}

function BudgetTotalRow({
  label,
  budget,
  comfortable,
}: {
  label: string;
  budget: string;
  comfortable: string;
}) {
  return (
    <tr className="font-semibold">
      <td className="py-2 pr-4 text-slate-100">{label}</td>
      <td className="py-2 pr-4 text-right font-mono text-amber-400">
        {budget}
      </td>
      <td className="py-2 text-right font-mono text-amber-400">
        {comfortable}
      </td>
    </tr>
  );
}

function WageRow({
  label,
  minimum,
  comfortable,
  annualMin,
  annualComf,
}: {
  label: string;
  minimum: string;
  comfortable: string;
  annualMin: string;
  annualComf: string;
}) {
  return (
    <tr>
      <td className="py-2 pr-4 text-slate-300">{label}</td>
      <td className="py-2 pr-4 text-right">
        <span className="font-mono text-amber-400">{minimum}</span>
        <span className="block text-[10px] text-slate-600 font-mono">{annualMin}/yr</span>
      </td>
      <td className="py-2 text-right">
        <span className="font-mono text-amber-400">{comfortable}</span>
        <span className="block text-[10px] text-slate-600 font-mono">{annualComf}/yr</span>
      </td>
    </tr>
  );
}

function Neighborhood({
  name,
  description,
}: {
  name: string;
  description: string;
}) {
  return (
    <div>
      <span className="text-sm font-medium text-slate-200">{name}</span>
      <span className="text-sm text-slate-500"> — </span>
      <span className="text-sm text-slate-400">{description}</span>
    </div>
  );
}

function ResourceLink({
  label,
  href,
  description,
}: {
  label: string;
  href: string;
  description: string;
}) {
  return (
    <div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-amber-400/80 hover:text-amber-400 underline underline-offset-2"
      >
        {label}
      </a>
      <span className="text-slate-600"> — </span>
      <span className="text-slate-500">{description}</span>
    </div>
  );
}

function ExtLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        className ??
        "text-amber-400/70 hover:text-amber-400 underline underline-offset-2"
      }
    >
      {children}
    </a>
  );
}
