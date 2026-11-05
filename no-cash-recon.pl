use strict; use warnings;
# The cash sheet no longer carries the two cash books, so the running
# check that added them up had nothing left to check.
my $p = "components/ReconCheck.tsx";
open(my $fh, "<", $p) or die "$p: $!";
binmode $fh; local $/; my $s = <$fh>; close $fh;
my $crlf = ($s =~ /\r\n/) ? 1 : 0;
$s =~ s/\r\n/\n/g;
my $a = '  if (formId === "cash_daily") {' . "\n";
my $b = $a . "    return null;\n";
if (index($s, $b) >= 0) { print "already done\n"; exit 0; }
($s =~ s/\Q$a\E/$b/) or do { print "could not place it\n"; exit 1 };
$s =~ s/\n/\r\n/g if $crlf;
open(my $out, ">", $p) or die $!; binmode $out; print $out $s; close $out;
print "ok\n";
