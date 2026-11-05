use strict; use warnings;
# The accounts office fills these three in by hand now, to the format the
# department agreed, so the spreadsheet step only stood in the way. The
# stock reports still come in from a workbook, so they keep theirs.
my $p = "components/ExcelImport.tsx";
open(my $fh, "<", $p) or die "$p: $!";
binmode $fh; local $/; my $s = <$fh>; close $fh;
my $crlf = ($s =~ /\r\n/) ? 1 : 0;
$s =~ s/\r\n/\n/g;
my $n = 0;
for my $k ('cash_daily: "Cashbook",', 'sale_income_daily: "Daily Sale & Income",',
           'purchase_payable_daily: "Purchase & Payable",') {
  $n++ if $s =~ s/^\s*\Q$k\E\n//m;
}
if ($n == 0) { print "already done\n"; exit 0; }
$s =~ s/\n/\r\n/g if $crlf;
open(my $out, ">", $p) or die $!; binmode $out; print $out $s; close $out;
print "ok ($n removed)\n";
