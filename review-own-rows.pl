use strict; use warnings;
# Review was showing everything the viewer is allowed to read, which for a
# manager granted a whole department meant other managers' teams as well.
# It shows the work of the people he answers for.
my $p = "app/review/page.tsx";
open(my $fh, "<", $p) or die "$p: $!";
binmode $fh; local $/; my $s = <$fh>; close $fh;
my $crlf = ($s =~ /\r\n/) ? 1 : 0;
$s =~ s/\r\n/\n/g;
if ($s =~ /ownRows/) { print "already done\n"; exit 0; }
my $a = "  const visible = useMemo(() => {\n";
my $b = <<'B';
  // Only the people this viewer answers for. A department-wide read is
  // for looking things up, not a queue of other teams' work.
  const ownRows = useMemo(
    () => (staffOf.size ? rows.filter((r) => staffOf.has(String(r.created_by))) : rows),
    [rows, staffOf]
  );

  const visible = useMemo(() => {
B
($s =~ s/\Q$a\E/$b/) or do { print "could not place it\n"; exit 1 };
my $n = ($s =~ s/\? rows\.filter\(\(r\) => r\.status/? ownRows.filter((r) => r.status/g);
$s =~ s/      : rows;\n/      : ownRows;\n/g;
$s =~ s/\n/\r\n/g if $crlf;
open(my $out, ">", $p) or die $!; binmode $out; print $out $s; close $out;
print "ok ($n)\n";
