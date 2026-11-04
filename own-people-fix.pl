use strict; use warnings;
# Narrowing to "your own people" is right for a manager and wrong for a
# clerk, who has none and was left with an empty page. Where there is
# nobody underneath, the viewer sees everything he is allowed to read.
my %f = (
  "app/dept/[name]/page.tsx" =>
    ["const keep = (e: string) => mine.size === 0 || mine.has(e);",
     "const keep = (e: string) => mine.size <= 1 || mine.has(e);"],
  "app/review/page.tsx" =>
    ["() => (staffOf.size ? rows.filter((r) => staffOf.has(String(r.created_by))) : rows),",
     "() => (staffOf.size > 1 ? rows.filter((r) => staffOf.has(String(r.created_by))) : rows),"],
);
for my $p (sort keys %f) {
  my ($a, $b) = @{ $f{$p} };
  open(my $fh, "<", $p) or die "$p: $!";
  binmode $fh; local $/; my $s = <$fh>; close $fh;
  my $crlf = ($s =~ /\r\n/) ? 1 : 0;
  $s =~ s/\r\n/\n/g;
  if ($s =~ /\Q$b\E/) { print "$p: already done\n"; next; }
  ($s =~ s/\Q$a\E/$b/) or do { print "$p: could not place it\n"; next };
  $s =~ s/\n/\r\n/g if $crlf;
  open(my $out, ">", $p) or die $!; binmode $out; print $out $s; close $out;
  print "$p: ok\n";
}
