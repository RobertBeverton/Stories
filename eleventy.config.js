export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("stories/**/*.mp3");
  eleventyConfig.addPassthroughCopy("site/assets");

  eleventyConfig.addCollection("stories", (collectionApi) => {
    return collectionApi.getFilteredByGlob("stories/**/*.md");
  });

  return {
    dir: {
      input: "site",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
  };
}
