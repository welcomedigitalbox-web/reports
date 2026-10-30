use strict; use warnings;
# The person filter used to be built from whoever had already filed
# something, so a new starter did not exist until their first report and
# a manager could not look up their own people by name. It is built from
# the staff list now, grouped under the manager each person answers to.
my $p = "app/review/page.tsx";
open(my $fh, "<", $p) or die "$p: $!";
binmode $fh; local $/; my $s = <$fh>; close $fh;
die "$p looks empty\n" if length($s) < 500;
my $crlf = ($s =~ /\r\n/) ? 1 : 0;
$s =~ s/\r\n/\n/g;
if ($s =~ /peopleGroups/) { print "already done\n"; exit 0; }

# ---- load the staff list, with who each person answers to -----------
my $a1 = <<'A1';
  const [mgrEmails, setMgrEmails] = useState<Set<string>>(new Set());
A1
my $b1 = <<'B1';
  const [mgrEmails, setMgrEmails] = useState<Set<string>>(new Set());
  // email -> the manager they answer to, for grouping the filter.
  const [staffOf, setStaffOf] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    supabase.from("profiles").select("id, email, reports_to").then(({ data }) => {
      const list = (data as { id: string; email: string; reports_to: string | null }[]) || [];
      const byId = new Map(list.map((x) => [String(x.id), String(x.email)]));
      const m = new Map<string, string>();
      for (const x of list) {
        if (!x.email) continue;
        m.set(String(x.email), x.reports_to ? byId.get(String(x.reports_to)) || "" : "");
      }
      setStaffOf(m);
    });
  }, []);
B1
($s =~ s/\Q$a1\E/$b1/) or do { print "could not place the staff query\n"; exit 1 };

# ---- group them ------------------------------------------------------
my $a2 = <<'A2';
  const people = useMemo(() => {
    const set = new Set(rows.map((r) => String(r.created_by)).filter(Boolean));
    return Array.from(set).sort();
  }, [rows]);
A2
my $b2 = <<'B2';
  // Everyone whose reports this viewer can see at all: the staff list plus
  // anyone who has filed something, in case a profile has since gone.
  const people = useMemo(() => {
    const set = new Set(rows.map((r) => String(r.created_by)).filter(Boolean));
    for (const e of staffOf.keys()) set.add(e);
    return Array.from(set).sort();
  }, [rows, staffOf]);

  // The same names, under the manager each one answers to.
  const peopleGroups = useMemo(() => {
    const g = new Map<string, string[]>();
    for (const e of people) {
      const head = staffOf.get(e) || "";
      const key = head || "\u2014";
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(e);
    }
    return Array.from(g.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [people, staffOf]);
B2
($s =~ s/\Q$a2\E/$b2/) or do { print "could not place the grouping\n"; exit 1 };

# ---- render ----------------------------------------------------------
my $a3 = <<'A3';
          <option value="">All</option>
          {people.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
A3
my $b3 = <<'B3';
          <option value="">All</option>
          {peopleGroups.map(([head, list]) => (
            <optgroup key={head} label={head === "\u2014" ? "no manager" : head}>
              {list.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </optgroup>
          ))}
B3
($s =~ s/\Q$a3\E/$b3/) or do { print "could not place the dropdown\n"; exit 1 };

$s =~ s/\n/\r\n/g if $crlf;
open(my $out, ">", $p) or die $!;
binmode $out; print $out $s; close $out;
print "ok\n";
