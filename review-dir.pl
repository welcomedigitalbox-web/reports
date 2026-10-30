use strict; use warnings;
# Reading the staff list straight off profiles only returned the handful
# of rows the viewer is allowed to see, so everybody landed under "no
# manager". The directory comes from the server now.
my $p = "app/review/page.tsx";
open(my $fh, "<", $p) or die "$p: $!";
binmode $fh; local $/; my $s = <$fh>; close $fh;
my $crlf = ($s =~ /\r\n/) ? 1 : 0;
$s =~ s/\r\n/\n/g;
if ($s =~ /staff_directory/) { print "already done\n"; exit 0; }

my $a = <<'A';
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
A
my $b = <<'B';
    supabase.rpc("staff_directory").then(({ data }) => {
      const list = (data as { email: string; manager_email: string | null }[]) || [];
      const m = new Map<string, string>();
      for (const x of list) {
        if (!x.email) continue;
        m.set(String(x.email), String(x.manager_email || ""));
      }
      setStaffOf(m);
    });
B
($s =~ s/\Q$a\E/$b/) or do { print "could not place it\n"; exit 1 };

$s =~ s/\n/\r\n/g if $crlf;
open(my $out, ">", $p) or die $!;
binmode $out; print $out $s; close $out;
print "ok\n";
